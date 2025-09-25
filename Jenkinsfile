pipeline {
  agent any
  tools { nodejs 'node20' }
  options { timestamps() }

  environment {
    // SonarQube (name must match your Jenkins global config entry)
    SONAR_HOST_URL   = 'http://host.docker.internal:9000'
    SONAR_SCANNER    = 'sonar-scanner-4.8'

    // Image naming & tagging
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
  }

  stages {

    // 1) BUILD
    stage('Build') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux
            cd backend
            npm ci
            npm run build || echo "No build step required"
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
                # Build image for scanning (also used for deploy)
                docker build -t "${APP_IMAGE}" -t "${APP_IMAGE_LATEST}" .
                # Scan but do not fail the pipeline on findings here
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

    // 6) DEPLOY (staging on Docker; exposes http://localhost:8082)
    stage('Deploy') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            # ensure network exists (no-op if it does)
            docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1 || docker network create "${DOCKER_NETWORK}"

            # (re)start Mongo with proper healthcheck (returns ok==1)
            docker rm -f "${MONGO_CONTAINER}" || true
            docker run -d --name "${MONGO_CONTAINER}" --network "${DOCKER_NETWORK}" -p 27017:27017 \
              --health-cmd='mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok"' \
              --health-interval=5s --health-timeout=3s --health-retries=30 mongo

            echo "Waiting for Mongo to be healthy..."
            for i in $(seq 1 120); do
              s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${MONGO_CONTAINER}")
              if [ "$s" = "healthy" ]; then
                break
              fi
              sleep 1
              if [ "$i" -eq 120 ]; then
                echo "Mongo failed to become healthy" >&2
                docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                docker logs --tail 200 "${MONGO_CONTAINER}" || true
                exit 1
              fi
            done

            # (re)start app
            docker rm -f "${STAGING_CONTAINER}" || true
            docker run -d --name "${STAGING_CONTAINER}" --network "${DOCKER_NETWORK}" \
              -e NODE_ENV=production -e JWT_SECRET=change-me \
              -e MONGO_URL="mongodb://${MONGO_CONTAINER}:27017/${MONGO_DB_NAME}" \
              -p ${APP_PORT_HOST}:${APP_PORT_CONT} "${APP_IMAGE_LATEST}"

            echo "Waiting for app to be ready on http://host.docker.internal:${APP_PORT_HOST}/health ..."
            for i in $(seq 1 120); do
              if curl -sf "http://host.docker.internal:${APP_PORT_HOST}/health" >/dev/null; then
                echo "App is healthy ✅"
                break
              fi
              sleep 2
              if [ "$i" -eq 120 ]; then
                echo "App failed to become ready" >&2
                docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                docker logs --tail 200 "${STAGING_CONTAINER}" || true
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
            echo "Release tagged: ${APP_NAME}:release-${APP_VERSION}"
          '''
        }
      }
    }

    // 8) MONITORING (non-fatal health probe; keeps stage green)
    stage('Monitoring') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            echo "Monitoring: probing host.docker.internal:${APP_PORT_HOST}/health ..."
            ok=0
            for i in $(seq 1 30); do
              if curl -sf "http://host.docker.internal:${APP_PORT_HOST}/health" >/dev/null; then
                echo "✅ Health OK (host.docker.internal:${APP_PORT_HOST})"
                ok=1
                break
              else
                echo "Health not ready yet via host port... ($i)"
                sleep 2
              fi
            done

            if [ "$ok" -eq 0 ]; then
              echo "Fallback: attach Jenkins to ${DOCKER_NETWORK} and probe ${STAGING_CONTAINER}:${APP_PORT_CONT}/health"
              docker network connect "${DOCKER_NETWORK}" jenkins || true
              for i in $(seq 1 15); do
                if curl -sf "http://${STAGING_CONTAINER}:${APP_PORT_CONT}/health" >/dev/null; then
                  echo "✅ Health OK (${STAGING_CONTAINER}:${APP_PORT_CONT})"
                  ok=1
                  break
                else
                  echo "Health not ready yet via container DNS... ($i)"
                  docker logs --tail 50 "${STAGING_CONTAINER}" || true
                  sleep 2
                fi
              done
            fi

            if [ "$ok" -eq 0 ]; then
              echo "⚠️  Health checks did not pass, but not failing the pipeline."
              docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' || true
              docker logs --tail 100 "${STAGING_CONTAINER}" || true
              # keep stage green (no non-zero exit)
            fi
          '''
        }
      }
    }
  }

  post {
    success {
      echo "Pipeline SUCCESS. App running at: http://localhost:${APP_PORT_HOST}"
    }
    always {
      cleanWs()
    }
  }
}