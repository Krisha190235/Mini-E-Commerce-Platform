pipeline {
  agent any
  tools { nodejs 'node18' }                       // Configure in Manage Jenkins → Tools
  options { timestamps() }

  environment {
    // SonarQube server name must match your Jenkins global config
    SONAR_HOST_URL   = 'http://host.docker.internal:9000'
    SONAR_SCANNER    = 'sonar-scanner-4.8'        // Manage Jenkins → Tools → SonarQube Scanner

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

    // (Quality Gate is part of Code Quality maturity; kept as a short gate here)
    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    // 4) SECURITY
    stage('Security') {
      parallel {
        stage('Snyk (deps)') {
          steps {
            ansiColor('xterm') {
              // Optional: add SNYK_TOKEN in Jenkins credentials if you want auth
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
                # Build a temporary image for scan if not already built
                docker build -t "${APP_IMAGE}" -t "${APP_IMAGE_LATEST}" .
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

    // 5) DEPLOY (staging on Docker; exposes http://localhost:8082)
    stage('Deploy') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux

            # Ensure network
            docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1 || docker network create "$DOCKER_NETWORK"

            # (Re)start Mongo with healthcheck
            docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
            docker run -d --name "$MONGO_CONTAINER" \
              --network "$DOCKER_NETWORK" -p 27017:27017 \
              --health-cmd="mongosh --quiet --eval 'db.adminCommand({ ping: 1 })' || exit 1" \
              --health-interval=5s --health-timeout=3s --health-retries=30 \
              mongo

            echo "Waiting for Mongo to be healthy..."
            for i in $(seq 1 120); do
              s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$MONGO_CONTAINER" || echo none)
              [ "$s" = healthy ] && break
              sleep 1
            done
            s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$MONGO_CONTAINER" || echo none)
            [ "$s" = healthy ] || { echo "Mongo never became healthy"; docker logs "$MONGO_CONTAINER" || true; exit 1; }

            # (Re)start app container
            docker rm -f "$STAGING_CONTAINER" >/dev/null 2>&1 || true
            docker run -d --name "$STAGING_CONTAINER" \
              --network "$DOCKER_NETWORK" \
              -e NODE_ENV=production \
              -e JWT_SECRET=change-me \
              -e MONGO_URL="mongodb://$MONGO_CONTAINER:27017/$MONGO_DB_NAME" \
              -p ${APP_PORT_HOST}:${APP_PORT_CONT} \
              "${APP_IMAGE_LATEST}"

            echo "Waiting for app to be ready on http://localhost:${APP_PORT_HOST}/health ..."
            for i in $(seq 1 120); do
              if curl -sf "http://localhost:${APP_PORT_HOST}/health" >/dev/null; then
                echo "App is ready: http://localhost:${APP_PORT_HOST}"
                exit 0
              fi
              sleep 2
            done
            echo "App failed to become ready"
            docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true
            docker logs --tail 200 "$STAGING_CONTAINER" || true
            exit 1
          '''
        }
      }
    }

    // 6) RELEASE (lightweight, tag image; push is optional)
    stage('Release') {
      steps {
        script {
          // Tag the local image with a version tag; optionally push if you add DockerHub creds
          sh '''
            set -eux
            docker tag "${APP_IMAGE_LATEST}" "${APP_NAME}:release-${APP_VERSION}"
            echo "Release tagged: ${APP_NAME}:release-${APP_VERSION}"
          '''
        }
      }
    }

    // 7) MONITORING (simple health probe + tail logs as demo)
    stage('Monitoring') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux
            for i in $(seq 1 15); do
              if curl -sf "http://localhost:${APP_PORT_HOST}/health" >/dev/null; then
                echo "✅ Health check OK at http://localhost:${APP_PORT_HOST}/health"
                exit 0
              fi
              echo "Health not ready yet... ($i)"
              docker logs --tail 50 "${STAGING_CONTAINER}" || true
              sleep 2
            done
            echo "❌ Health check failed after retries"
            exit 2
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
