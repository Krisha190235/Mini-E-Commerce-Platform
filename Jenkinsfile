pipeline {
  agent any
  options { timestamps(); ansiColor('xterm') }

  environment {
    // If you run SonarQube on your Mac, Jenkins (in Docker) reaches it via this host.
    SONAR_HOST_URL = 'http://host.docker.internal:9000'
    APP_IMAGE = "ecommerce-api:${BUILD_NUMBER}"
    APP_IMAGE_LATEST = "ecommerce-api:latest"
    DOCKER_NETWORK = "ecommerce-net"
    MONGO_CONTAINER = "ecommerce-mongo"
    STAGING_CONTAINER = "ecommerce-staging"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps {
        sh '''
          cd backend
          npm ci
          npm run build
        '''
      }
      post {
        success { archiveArtifacts artifacts: 'backend/**', fingerprint: true }
      }
    }

    stage('Test') {
      steps {
        sh 'cd backend && npm test -- --ci --coverage'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/**/junit/*.xml'
          publishHTML([
            allowMissing: true,
            reportDir: 'backend/coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: 'Coverage'
          ])
        }
      }
    }

    stage('Code Quality') {
      steps {
        withSonarQubeEnv('SonarQube') {
          dir('backend') {
            sh '''
              npx sonar-scanner \
                -Dsonar.projectKey=ecommerce-backend \
                -Dsonar.sources=. \
                -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
            '''
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          // Try to login to Docker Hub to avoid anonymous rate limits
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKERHUB_USR', passwordVariable: 'DOCKERHUB_PSW')]) {
              sh 'echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin'
            }
          } catch (e) {
            echo 'DockerHub credentials not configured. Building anonymously (may hit rate limits).'
          }

          sh '''
            docker build -t "${APP_IMAGE}" -t "${APP_IMAGE_LATEST}" .
          '''
        }
      }
    }

    stage('Security') {
      parallel {
        stage('Snyk') {
          steps {
            withCredentials([string(credentialsId: 'SNYK_TOKEN', variable: 'SNYK_TOKEN')]) {
              sh '''
                npm install -g snyk || true
                snyk auth "$SNYK_TOKEN"
                cd backend
                snyk test --severity-threshold=medium || true
              '''
            }
          }
        }

        stage('Trivy Image Scan') {
          steps {
            script {
              // Ensure pulls (trivy image, base layers) won’t rate-limit
              try {
                withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKERHUB_USR', passwordVariable: 'DOCKERHUB_PSW')]) {
                  sh 'echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin'
                }
              } catch (e) {
                echo 'DockerHub credentials not configured for Trivy; scanning anonymously.'
              }

              sh '''
                docker run --rm \
                  -v /var/run/docker.sock:/var/run/docker.sock \
                  aquasec/trivy:latest image \
                  --exit-code 1 --severity CRITICAL \
                  "${APP_IMAGE}" | tee trivy.txt
              '''
            }
          }
          post { always { archiveArtifacts artifacts: 'trivy.txt', fingerprint: true } }
        }
      }
    }

    stage('Docker Push (optional)') {
      steps {
        script {
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKERHUB_USR', passwordVariable: 'DOCKERHUB_PSW')]) {
              sh '''
                echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
                docker tag "${APP_IMAGE}" "${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}"
                docker tag "${APP_IMAGE_LATEST}" "${DOCKERHUB_USR}/ecommerce-api:latest"
                docker push "${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}"
                docker push "${DOCKERHUB_USR}/ecommerce-api:latest"
              '''
            }
          } catch (err) {
            echo 'DockerHub credentials not configured, skipping push.'
          }
        }
      }
    }

    stage('Deploy') {
  steps {
    sh '''
      set -eux

      DOCKER_NETWORK="ecommerce-net"
      MONGO_CONTAINER="ecommerce-mongo"
      STAGING_CONTAINER="ecommerce-staging"
      APP_PORT_HOST=8082
      APP_PORT_CONTAINER=3000
      MONGO_DB_NAME=ecom

      # Ensure network
      docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1 || docker network create "$DOCKER_NETWORK"

      # (Re)start Mongo with a healthcheck
      docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
      docker run -d --name "$MONGO_CONTAINER" \
        --network "$DOCKER_NETWORK" -p 27017:27017 \
        --health-cmd='mongosh --quiet --eval "db.adminCommand({ ping: 1 })" || exit 1' \
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

      # (Re)start app
      docker rm -f "$STAGING_CONTAINER" >/dev/null 2>&1 || true
      docker run -d --name "$STAGING_CONTAINER" \
        --network "$DOCKER_NETWORK" \
        -e NODE_ENV=production \
        -e JWT_SECRET=change-me \
        -e MONGO_URL="mongodb://$MONGO_CONTAINER:27017/$MONGO_DB_NAME" \
        -p ${APP_PORT_HOST}:${APP_PORT_CONTAINER} \
        ecommerce-api:latest

      # Wait for app container to be healthy or respond on /health
      echo "Waiting for app to be ready..."
      for i in $(seq 1 120); do
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$STAGING_CONTAINER" || echo none)
        if [ "$status" = healthy ] || curl -sf "http://localhost:${APP_PORT_HOST}/health" >/dev/null 2>&1; then
          echo "App is ready."
          exit 0
        fi
        sleep 2
      done
      echo "App never became ready"
      docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
      docker logs --tail 200 "$STAGING_CONTAINER" || true
      exit 1
    '''
  }
}

stage('Monitoring') {
  steps {
    sh '''
      set -e
      for i in $(seq 1 30); do
        if curl -sf http://localhost:8082/health >/dev/null; then
          echo "Staging health check passed."
          exit 0
        fi
        echo "Retry $i: app not ready yet..."
        docker logs --tail 50 ecommerce-staging || true
        sleep 2
      done
      echo "Health check failed after retries"
      exit 7
    '''
  }
}

    stage('Release') {
      steps {
        input message: 'Promote to PRODUCTION?'
        echo 'Promote same image tag to production environment here'
      }
    }
  }

  post { always { cleanWs() } }
}