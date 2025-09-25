pipeline {
  agent any
  options { timestamps(); ansiColor('xterm') }

  environment {
    SONAR_HOST_URL = 'http://host.docker.internal:9000'
    DOCKER_IMAGE   = "ecommerce-api:${BUILD_NUMBER}"
    DOCKER_IMAGE_LATEST = "ecommerce-api:latest"
    DOCKER_NET     = "ecommerce-net"
    MONGO_CONT     = "ecommerce-mongo"
    APP_CONT       = "ecommerce-staging"
    APP_PORT_HOST  = "8082"
    APP_PORT_CONT  = "3000"
    MONGO_URL      = "mongodb://ecommerce-mongo:27017/ecom"
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

    // Build image once (logged-in) so later stages don't hit Docker Hub rate limits
    stage('Docker Build') {
      steps {
        script {
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub',
                      usernameVariable: 'DOCKERHUB_USR',
                      passwordVariable: 'DOCKERHUB_PSW')]) {
              sh '''
                echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
                docker build -t "$DOCKER_IMAGE" -t "$DOCKER_IMAGE_LATEST" .
                docker logout || true
              '''
            }
          } catch (err) {
            // If dockerhub creds are not configured, still attempt an anonymous build (may hit rate limits)
            echo 'DockerHub credentials not configured. Attempting anonymous build...'
            sh 'docker build -t "$DOCKER_IMAGE" -t "$DOCKER_IMAGE_LATEST" .'
          }
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
            sh '''
              docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                aquasec/trivy:latest image \
                --exit-code 1 --severity CRITICAL \
                "$DOCKER_IMAGE" | tee trivy.txt || true
            '''
          }
          post {
            always { archiveArtifacts artifacts: 'trivy.txt', fingerprint: true }
          }
        }
      }
    }

    stage('Docker Push (optional)') {
      steps {
        script {
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub',
                      usernameVariable: 'DOCKERHUB_USR',
                      passwordVariable: 'DOCKERHUB_PSW')]) {
              sh '''
                echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
                docker tag "$DOCKER_IMAGE_LATEST" ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker tag "$DOCKER_IMAGE_LATEST" ${DOCKERHUB_USR}/ecommerce-api:latest
                docker push ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker push ${DOCKERHUB_USR}/ecommerce-api:latest
                docker logout || true
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
          # network (idempotent)
          docker network create "$DOCKER_NET" || true

          # db (idempotent)
          docker rm -f "$MONGO_CONT" 2>/dev/null || true
          docker run -d --name "$MONGO_CONT" --network "$DOCKER_NET" -p 27017:27017 mongo

          # app
          docker rm -f "$APP_CONT" 2>/dev/null || true
          docker run -d --name "$APP_CONT" \
            --network "$DOCKER_NET" \
            -e NODE_ENV=production \
            -e JWT_SECRET=change-me \
            -e MONGO_URL="$MONGO_URL" \
            -p ${APP_PORT_HOST}:${APP_PORT_CONT} \
            "$DOCKER_IMAGE_LATEST"
        '''
      }
    }

    stage('Monitoring') {
      steps {
        sh 'curl -sf http://localhost:${APP_PORT_HOST}/health'
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

  post {
    always { cleanWs() }
  }
}