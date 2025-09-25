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
          # Create network if missing
          docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1 || docker network create "${DOCKER_NETWORK}"

          # Restart Mongo (idempotent)
          docker rm -f "${MONGO_CONTAINER}" >/dev/null 2>&1 || true
          docker run -d --name "${MONGO_CONTAINER}" --network "${DOCKER_NETWORK}" -p 27017:27017 mongo

          # Restart staging API with proper DB URL
          docker rm -f "${STAGING_CONTAINER}" >/dev/null 2>&1 || true
          docker run -d --name "${STAGING_CONTAINER}" \
            --network "${DOCKER_NETWORK}" \
            -e NODE_ENV=production \
            -e JWT_SECRET=change-me \
            -e MONGO_URL="mongodb://${MONGO_CONTAINER}:27017/ecom" \
            -p 8082:3000 \
            "${APP_IMAGE_LATEST}"
        '''
      }
    }

    stage('Monitoring') {
      steps {
        sh 'curl -sf http://localhost:8082/health'
        echo 'Staging health check passed.'
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