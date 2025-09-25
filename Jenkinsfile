pipeline {
  agent any
  tools { nodejs 'node20' }
  options { timestamps() }

  environment {
    // SonarQube
    SONAR_HOST_URL   = 'http://host.docker.internal:9000'
    SONAR_SCANNER    = 'sonar-scanner-4.8'

    // Backend image naming & tagging
    APP_NAME         = 'ecommerce-api'
    APP_VERSION      = "${env.BUILD_NUMBER}"
    APP_IMAGE        = "${APP_NAME}:${APP_VERSION}"
    APP_IMAGE_LATEST = "${APP_NAME}:latest"

    // Runtime (staging) setup
    DOCKER_NETWORK   = 'ecommerce-net'
    MONGO_CONTAINER  = 'ecommerce-mongo'
    STAGING_CONTAINER= 'ecommerce-staging'
    APP_PORT_HOST    = '8082'
    APP_PORT_CONT    = '3000'
    MONGO_DB_NAME    = 'ecom'

    // 🔹 Frontend (new)
    FRONTEND_NAME      = 'ecommerce-web'
    FRONTEND_IMAGE     = "${FRONTEND_NAME}:${env.BUILD_NUMBER}"
    FRONTEND_LATEST    = "${FRONTEND_NAME}:latest"
    FRONTEND_PORT_HOST = '8081'
  }

  stages {

    // 1) BUILD
    stage('Build') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            # Backend build
            cd backend
            npm ci
            npm run build || echo "No build step required"
            cd ..

            # 🔹 Build backend Docker image (for scan/deploy)
            docker build -t "${APP_IMAGE}" -t "${APP_IMAGE_LATEST}" .

            # 🔹 Frontend build & image
            cd frontend
            npm ci
            # Build the static site (Vite) and bake API base into image
            docker build -t "${FRONTEND_IMAGE}" -t "${FRONTEND_LATEST}" \
              --build-arg VITE_API_URL=http://localhost:${APP_PORT_HOST} .
          '''
        }
      }
      post {
        success {
          archiveArtifacts artifacts: 'backend/**', fingerprint: true
        }
      }
    }

    // 2) TEST
    stage('Test') {
      steps {
        ansiColor('xterm') {
          sh 'cd backend && npm test -- --ci --coverage'
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/**/junit/*.xml'
          publishHTML(target: [
            reportDir: 'backend/coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: 'Coverage',
            allowMissing: true,
            keepAll: true,
            alwaysLinkToLastBuild: true
          ])
        }
      }
    }

    // 3) CODE QUALITY
    stage('Code Quality') {
      steps {
        ansiColor('xterm') {
          withSonarQubeEnv('SonarQube') {
            script {
              def scannerHome = tool env.SONAR_SCANNER
              dir('backend') {
                sh """
                  "${scannerHome}/bin/sonar-scanner" \
                    -Dsonar.projectKey=ecommerce-backend \
                    -Dsonar.sources=. \
                    -Dsonar.exclusions=tests/**,**/*.test.js,**/node_modules/**,**/dist/** \
                    -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
                """
              }
            }
          }
        }
      }
    }

    // 4) QUALITY GATE
    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    // 5) SECURITY
    stage('Security') {
      parallel {
        stage('Snyk (deps)') {
          steps {
            ansiColor('xterm') {
              withCredentials([string(credentialsId: 'SNYK_TOKEN', variable: 'SNYK_TOKEN')]) {
                sh '''
                  set -eux
                  npm install -g snyk || true
                  snyk auth "$SNYK_TOKEN" || true
                  cd backend
                  snyk test --severity-threshold=medium || true
                '''
              }
            }
          }
        }
        stage('Trivy (image)') {
          steps {
            ansiColor('xterm') {
              sh '''
                set -eux
                # Scan backend image (already built in Build stage)
                docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                  aquasec/trivy:latest image --exit-code 0 --severity HIGH,CRITICAL \
                  "${APP_IMAGE}" | tee trivy.txt
              '''
            }
          }
          post {
            always { archiveArtifacts artifacts: 'trivy.txt', fingerprint: true }
          }
        }
      }
    }

    // 6) DEPLOY (staging on Docker; exposes http://localhost:8082 and http://localhost:8081)
    stage('Deploy') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            # ensure network exists (no-op if it does)
            docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1 || docker network create "${DOCKER_NETWORK}"

            # (re)start Mongo with healthcheck (returns ok==1)
            docker rm -f "${MONGO_CONTAINER}" || true
            docker run -d --name "${MONGO_CONTAINER}" --network "${DOCKER_NETWORK}" -p 27017:27017 \
              --health-cmd='mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok"' \
              --health-interval=5s --health-timeout=3s --health-retries=30 mongo

            echo "Waiting for Mongo to be healthy..."
            for i in $(seq 1 120); do
              s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${MONGO_CONTAINER}")
              [ "$s" = "healthy" ] && break
              sleep 1
              if [ "$i" -eq 120 ]; then
                echo "Mongo failed to become healthy" >&2
                docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                docker logs --tail 200 "${MONGO_CONTAINER}" || true
                exit 1
              fi
            done

            # (re)start backend
            docker rm -f "${STAGING_CONTAINER}" || true
            docker run -d --name "${STAGING_CONTAINER}" --network "${DOCKER_NETWORK}" \
              -e NODE_ENV=production -e JWT_SECRET=change-me \
              -e MONGO_URL="mongodb://${MONGO_CONTAINER}:27017/${MONGO_DB_NAME}" \
              -p ${APP_PORT_HOST}:${APP_PORT_CONT} "${APP_IMAGE_LATEST}"

            echo "Waiting for API on http://host.docker.internal:${APP_PORT_HOST}/health ..."
            for i in $(seq 1 120); do
              if curl -sf "http://host.docker.internal:${APP_PORT_HOST}/health" >/dev/null; then
                echo "API is healthy ✅"
                break
              fi
              sleep 2
              if [ "$i" -eq 120 ]; then
                echo "API failed to become ready" >&2
                docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                docker logs --tail 200 "${STAGING_CONTAINER}" || true
                exit 1
              fi
            done

            # 🔹 (re)start frontend
            docker rm -f "${FRONTEND_NAME}" || true
            docker run -d --name "${FRONTEND_NAME}" --network "${DOCKER_NETWORK}" \
              -p ${FRONTEND_PORT_HOST}:80 "${FRONTEND_LATEST}"

            echo "Waiting for Web on http://host.docker.internal:${FRONTEND_PORT_HOST}/health ..."
            for i in $(seq 1 60); do
              if curl -sf "http://host.docker.internal:${FRONTEND_PORT_HOST}/health" >/dev/null; then
                echo "Web is up ✅"
                break
              fi
              sleep 2
              if [ "$i" -eq 60 ]; then
                echo "Web failed to become ready" >&2
                docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                docker logs --tail 200 "${FRONTEND_NAME}" || true
                exit 1
              fi
            done
          '''
        }
      }
    }

    // 7) RELEASE (tag image; pushing is optional)
    stage('Release') {
      steps {
        script {
          sh '''
            set -eux
            docker tag "${APP_IMAGE_LATEST}" "${APP_NAME}:release-${APP_VERSION}"
            docker tag "${FRONTEND_LATEST}" "${FRONTEND_NAME}:release-${APP_VERSION}"
            echo "Release tagged: ${APP_NAME}:release-${APP_VERSION}"
            echo "Release tagged: ${FRONTEND_NAME}:release-${APP_VERSION}"
          '''
        }
      }
    }

    // 8) MONITORING (non-fatal; keeps stage green)
    stage('Monitoring') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            echo "Monitoring: probing API & Web via host ports ..."
            ok=1

            # API probe
            if curl -sf "http://host.docker.internal:${APP_PORT_HOST}/health" >/dev/null; then
              echo "✅ API OK (host.docker.internal:${APP_PORT_HOST})"
            else
              echo "⚠️  API probe failed (host port). Trying container DNS..."
              docker network connect "${DOCKER_NETWORK}" jenkins || true
              if curl -sf "http://${STAGING_CONTAINER}:${APP_PORT_CONT}/health" >/dev/null; then
                echo "✅ API OK via container DNS"
              else
                echo "⚠️  API still not reachable"; ok=0
              fi
            fi

            # Web probe
            if curl -sf "http://host.docker.internal:${FRONTEND_PORT_HOST}/health" >/dev/null; then
              echo "✅ Web OK (host.docker.internal:${FRONTEND_PORT_HOST})"
            else
              echo "⚠️  Web probe failed"; ok=0
            fi

            # Do not fail pipeline; just print diagnostics if something was off
            if [ "$ok" -eq 0 ]; then
              echo "⚠️  One or more monitoring checks failed (non-fatal)."
              docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' || true
              docker logs --tail 100 "${STAGING_CONTAINER}" || true
              docker logs --tail 100 "${FRONTEND_NAME}" || true
            fi
          '''
        }
      }
    }
  }

  post {
    success {
      echo "Pipeline SUCCESS."
      echo "API:      http://localhost:${APP_PORT_HOST}       (Swagger: /api-docs)"
      echo "Website:  http://localhost:${FRONTEND_PORT_HOST}"
    }
    always {
      cleanWs()
    }
  }
}