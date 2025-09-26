pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    FRONTEND_API_URL = 'http://localhost:8082'   // frontend → backend URL
  }

  stages {
    stage('Checkout') {
      steps {
        cleanWs()
        checkout([$class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[url: 'https://github.com/Krisha190235/Mini-E-Commerce-Platform.git']]
        ])
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -eux

          # ---- backend ----
          cd backend
          npm ci
          npm run build || echo "No backend build step required"
          cd ..

          # ---- frontend ----
          cd frontend
          npm ci
          npm run build
          cd ..
        '''

        // Build images only if Docker exists
        script {
          def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
          if (hasDocker) {
            sh '''
              set -eux
              # backend image uses repo Dockerfile (copies backend/*)
              docker build -t ecommerce-api:latest .

              # frontend image (builds Vite → NGINX)
              cd frontend
              docker build -t ecommerce-web:latest --build-arg VITE_API_URL='${FRONTEND_API_URL}' .
            '''
          } else {
            echo 'Docker not found on this agent — skipping image builds.'
          }
        }

        // Save build outputs (frontend dist, coverage later)
        archiveArtifacts artifacts: 'frontend/dist/**', allowEmptyArchive: true
      }
    }

    stage('Test') {
      steps {
        sh '''
          set -eux
          cd backend
          NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules \
            npm test -- --ci --coverage --passWithNoTests
        '''
      }
      post {
        always {
          // If you later add a JUnit reporter file, point junit() to it
          publishHTML(target: [
            allowMissing: true,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: 'backend/coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: 'Coverage'
          ])
          archiveArtifacts artifacts: 'backend/coverage/lcov.info', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality (ESLint)') {
      steps {
        // Only run if ESLint config exists in backend or frontend
        sh '''
          set -eux

          ran_any=0

          if jq -e '.eslintConfig' backend/package.json >/dev/null 2>&1 || [ -f backend/.eslintrc ] || [ -f backend/.eslintrc.json ]; then
            (cd backend && npx --yes eslint . || true)
            ran_any=1
          fi

          if jq -e '.eslintConfig' frontend/package.json >/dev/null 2>&1 || [ -f frontend/.eslintrc ] || [ -f frontend/.eslintrc.json ]; then
            (cd frontend && npx --yes eslint . || true)
            ran_any=1
          fi

          if [ "$ran_any" -eq 0 ]; then
            echo "No ESLint config found — skipping lint."
          fi
        '''
      }
    }

    stage('Security') {
      parallel {
        stage('npm audit (backend)') {
          steps {
            sh '''
              set -eux
              cd backend
              npm audit --audit-level=high || true
            '''
          }
        }
        stage('npm audit (frontend)') {
          steps {
            sh '''
              set -eux
              cd frontend
              npm audit --audit-level=high || true
            '''
          }
        }
        stage('Trivy (images) [optional]') {
          when {
            expression { sh(returnStatus:true, script:'command -v trivy >/dev/null 2>&1') == 0 && sh(returnStatus:true, script:'command -v docker >/dev/null 2>&1') == 0 }
          }
          steps {
            sh '''
              set -eux
              trivy image --exit-code 0 --severity HIGH,CRITICAL ecommerce-api:latest || true
              trivy image --exit-code 0 --severity HIGH,CRITICAL ecommerce-web:latest || true
            '''
          }
        }
      }
    }

    stage('Deploy (local test)') {
      when {
        expression { sh(returnStatus:true, script:'command -v docker >/dev/null 2>&1') == 0 }
      }
      steps {
        // Use plain docker run (your agent doesn't have `docker compose`)
        sh '''
          set -eux

          # Stop & remove old containers if present
          docker rm -f ecommerce-api || true
          docker rm -f ecommerce-web || true

          # Run backend on 8082
          docker run -d --name ecommerce-api -p 8082:8082 ecommerce-api:latest

          # Run frontend (NGINX) on 8081
          docker run -d --name ecommerce-web -p 8081:80 ecommerce-web:latest

          echo "Backend → http://localhost:8082/health  |  Frontend → http://localhost:8081"
        '''
      }
    }

    stage('Release') {
      steps {
        echo 'Release placeholder: push images to registry or create GitHub release.'
        // Example (if creds configured):
        // withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'U', passwordVariable: 'P')]) {
        //   sh '''
        //     set -eux
        //     echo "$P" | docker login -u "$U" --password-stdin
        //     docker tag ecommerce-api:latest youruser/ecommerce-api:latest
        //     docker tag ecommerce-web:latest youruser/ecommerce-web:latest
        //     docker push youruser/ecommerce-api:latest
        //     docker push youruser/ecommerce-web:latest
        //   '''
        // }
      }
    }

    stage('Monitoring') {
      steps {
        echo 'Monitoring placeholder: wire to uptime checks / Prometheus / Grafana as needed.'
      }
    }
  }

  post {
    success {
      echo "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} succeeded."
    }
    failure {
      echo "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} failed."
    }
    always {
      archiveArtifacts artifacts: 'frontend/dist/**, backend/coverage/**', allowEmptyArchive: true
      cleanWs()
    }
  }
}
