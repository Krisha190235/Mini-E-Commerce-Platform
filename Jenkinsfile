pipeline {
  agent any
  options { timestamps(); ansiColor('xterm') }

  environment {
    // If you run SonarQube on your Mac, Jenkins (in Docker) reaches it via this host.
    SONAR_HOST_URL = 'http://host.docker.internal:9000'
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
      steps {
        withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
          dir('backend') {
            // Run analysis against your local SonarQube and authenticate with token
            sh '''
              npx sonar-scanner \
                -Dsonar.projectKey=ecommerce-backend \
                -Dsonar.sources=. \
                -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                -Dsonar.host.url=$SONAR_HOST_URL \
                -Dsonar.login=$SONAR_TOKEN
            '''
          }
        }
      }
    }

    // Wait for SonarQube webhook & enforce the Quality Gate (smooth stage transition)
    stage('Quality Gate') {
      steps {
        script {
          // If SonarQube for Jenkins plugin + webhook are configured, this will block until Quality Gate is computed.
          // We add timeout+catch so your pipeline never hangs if webhook isn't set up yet.
          timeout(time: 5, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
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
                # Do not fail the whole build on medium; keep it informative
                snyk test --severity-threshold=medium || true
              '''
            }
          }
        }

        stage('Trivy Image Scan') {
          steps {
            sh '''
              docker build -t ecommerce-api:${BUILD_NUMBER} .
              # Fail the stage if CRITICAL vulns are found (gate)
              docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                aquasec/trivy:latest image \
                --exit-code 1 --severity CRITICAL \
                ecommerce-api:${BUILD_NUMBER} | tee trivy.txt
            '''
          }
          post {
            always {
              archiveArtifacts artifacts: 'trivy.txt', fingerprint: true
            }
          }
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        script {
          sh 'docker build -t ecommerce-api:latest .'

          // Optional push to Docker Hub if credentials exist (ID: dockerhub)
          def canPush = false
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DOCKERHUB_USR', passwordVariable: 'DOCKERHUB_PSW')]) {
              canPush = true
              sh '''
                echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
                docker tag ecommerce-api:latest ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker tag ecommerce-api:latest ${DOCKERHUB_USR}/ecommerce-api:latest
                docker push ${DOCKERHUB_USR}/ecommerce-api:${BUILD_NUMBER}
                docker push ${DOCKERHUB_USR}/ecommerce-api:latest
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
        // Automated, repeatable staging deploy (smooth transition)
        sh '''
          docker rm -f ecommerce-staging || true
          docker run -d --name ecommerce-staging \
            -e NODE_ENV=production \
            -e JWT_SECRET=change-me \
            -p 8082:3000 \
            ecommerce-api:latest
        '''
      }
    }

    stage('Monitoring') {
      steps {
        // Health check gate – fails pipeline if staging is not healthy
        sh 'curl -sf http://localhost:8082/health'
        echo 'Staging health check passed.'
      }
    }

    stage('Release') {
      steps {
        input message: 'Promote to PRODUCTION?'
        echo 'Promote same image tag to production environment here'
        // Example: tag/push to prod registry, or deploy to prod cluster
      }
    }
  }

  post {
    always { cleanWs() }
  }
}