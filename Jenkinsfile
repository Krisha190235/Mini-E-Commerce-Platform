pipeline {
  agent any
  options { timestamps(); ansiColor('xterm') }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps { sh 'cd backend && npm ci && npm run build' }
      post { success { archiveArtifacts artifacts: 'backend/**', fingerprint: true } }
    }

    stage('Test') {
      steps {
        sh 'cd backend && npm test -- --ci --coverage'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/**/junit/*.xml'
          publishHTML([allowMissing: true, reportDir: 'backend/coverage/lcov-report', reportFiles: 'index.html', reportName: 'Coverage'])
        }
      }
    }

    stage('Code Quality') {
      steps {
        dir('backend') {
          sh 'npx sonar-scanner || true'
        }
      }
    }

    stage('Security') {
      parallel {
        stage('Snyk') {
          steps {
            sh 'npm install -g snyk || true'
            sh 'cd backend && snyk test --severity-threshold=medium || true'
          }
        }
        stage('Trivy Image Scan') {
          steps {
            sh 'docker build -t ecommerce-api:${BUILD_NUMBER} .'
            sh 'trivy image --exit-code 0 --severity HIGH,CRITICAL ecommerce-api:${BUILD_NUMBER} | tee trivy.txt || true'
            archiveArtifacts artifacts: 'trivy.txt', fingerprint: true
          }
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        sh 'docker build -t ecommerce-api:latest .'
        echo 'Push to registry here (Docker Hub/ECR) if configured'
      }
    }

    stage('Deploy') {
      steps {
        echo 'Deploy to staging (e.g., AWS Elastic Beanstalk / ECS) goes here'
      }
    }

    stage('Monitoring') {
      steps {
        echo 'Run health checks and/or ping monitoring agents (Datadog/New Relic)'
      }
    }

    stage('Release') {
      steps {
        input message: "Promote to PRODUCTION?"
        echo 'Promote same image tag to production environment here'
      }
    }
  }

  post {
    always { cleanWs() }
  }
}