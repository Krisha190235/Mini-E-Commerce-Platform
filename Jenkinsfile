pipeline {
  agent any
  options { timestamps(); ansiColor('xterm') }

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
        success {
          archiveArtifacts artifacts: 'backend/**', fingerprint: true
        }
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
      environment {
        // SonarQube is running on your Mac; Jenkins container reaches it via this host.
        SONAR_HOST_URL = 'http://host.docker.internal:9000'
      }
      steps {
        withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
          dir('backend') {
            // Use sonar-project.properties, but force host & token here
            sh '''
              npx sonar-scanner \
                -Dsonar.host.url=$SONAR_HOST_URL \
                -Dsonar.login=$SONAR_TOKEN
            '''
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
              docker build -t ecommerce-api:${BUILD_NUMBER} .
              docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                aquasec/trivy:latest image \
                --exit-code 0 --severity HIGH,CRITICAL \
                ecommerce-api:${BUILD_NUMBER} | tee trivy.txt
            '''
            archiveArtifacts artifacts: 'trivy.txt', fingerprint: true
          }
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        script {
          // Build always
          sh 'docker build -t ecommerce-api:latest .'

          // Optional push to Docker Hub if creds exist (create Jenkins creds with ID "dockerhub")
          def hasDockerhub = (credentials('dockerhub') != null)
          if (hasDockerhub) {
            withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKERHUB_USR', passwordVariable: 'DOCKERHUB_PSW')]) {
              sh '''
                echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
                docker tag ecommerce-api:latest ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker tag ecommerce-api:latest ${DOCKERHUB_USR}/ecommerce-api:latest
                docker push ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker push ${DOCKERHUB_USR}/ecommerce-api:latest
              '''
            }
          } else {
            echo 'DockerHub credentials not configured, skipping push.'
          }
        }
      }
    }

    stage('Deploy') {
      steps {
        echo 'Deploy to staging (e.g., AWS Elastic Beanstalk / ECS) goes here'
        // Example local staging run (uncomment if you want it):
        // sh '''
        //   docker rm -f ecommerce-staging || true
        //   docker run -d --name ecommerce-staging \
        //     -e MONGO_URL=mongodb://host.docker.internal:27017/ecom \
        //     -e JWT_SECRET=change-me \
        //     -p 8082:3000 \
        //     ecommerce-api:latest
        // '''
      }
    }

    stage('Monitoring') {
      steps {
        echo 'Run health checks and/or ping monitoring agents (Datadog/New Relic)'
        // Example health check for local staging (uncomment if you enabled Deploy above):
        // sh 'curl -sf http://localhost:8082/health'
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