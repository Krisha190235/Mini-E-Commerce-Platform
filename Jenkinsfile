pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
    skipDefaultCheckout(false)
  }

  tools {
    nodejs 'node18'
    // Manage Jenkins → Tools → SonarQube Scanner Installations
    // Name must be: sonar-scanner-4.8
    sonarQubeScanner 'sonar-scanner-4.8'
  }

  environment {
    DOCKER_BUILDKIT = '1'
    IMAGE_TAG = "${env.BUILD_NUMBER}"
    FRONTEND_API_URL = 'http://localhost:8082'
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
        ansiColor('xterm') {
          sh '''
            set -eux
            cd backend
            npm ci
            npm run build || echo "No build step required"
            cd ..
          '''
          // Backend image (if docker exists)
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh """
                docker build -t ecommerce-api:${IMAGE_TAG} -t ecommerce-api:latest .
              """
            } else {
              echo 'Docker not found on this agent — skipping backend image build.'
            }
          }

          // Frontend build + image
          sh '''
            set -eux
            cd frontend
            npm ci
          '''
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh """
                cd frontend
                docker build \
                  --build-arg VITE_API_URL=${FRONTEND_API_URL} \
                  -t ecommerce-web:${IMAGE_TAG} -t ecommerce-web:latest .
              """
            } else {
              echo 'Docker not found on this agent — skipping frontend image build.'
            }
          }
        }

        // Archive some build outputs if any
        archiveArtifacts artifacts: 'backend/**, frontend/**', allowEmptyArchive: true
      }
    }

    stage('Test') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux
            cd backend
            NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules \
              npm test -- --ci --coverage
          '''
        }
      }
      post {
        always {
          junit testResults: 'backend/junit-report.xml', allowEmptyResults: true
          publishHTML(target: [
            allowMissing: true,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: 'backend/coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: 'Coverage'
          ])
          // Keep LCOV for Sonar
          archiveArtifacts artifacts: 'backend/coverage/lcov.info', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality') {
      environment {
        // Inject SonarQube server envs (SONAR_HOST_URL, etc.)
      }
      steps {
        withSonarQubeEnv('SonarQube') {
          withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
            // Use tool installations
            withEnv([
              "NODEJS_HOME=${tool name: 'node18', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'}",
              "SCANNER_HOME=${tool name: 'sonar-scanner-4.8', type: 'hudson.plugins.sonar.SonarRunnerInstallation'}"
            ]) {
              // IMPORTANT: single quotes so $SONAR_TOKEN/$SONAR_HOST_URL are expanded by sh, not Groovy
              sh '''
                set -euo pipefail
                export PATH="$NODEJS_HOME/bin:$SCANNER_HOME/bin:$PATH"
                node --version || true
                sonar-scanner \
                  -Dsonar.host.url=$SONAR_HOST_URL \
                  -Dsonar.token=$SONAR_TOKEN \
                  -Dsonar.projectKey=ecommerce-backend \
                  -Dsonar.projectBaseDir=backend \
                  -Dsonar.sources=src \
                  -Dsonar.tests=tests \
                  -Dsonar.inclusions=src/** \
                  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/*.test.js \
                  -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                  -Dsonar.nodejs.executable=$NODEJS_HOME/bin/node
              '''
            }
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        script {
          timeout(time: 5, unit: 'MINUTES') {
            def qg = waitForQualityGate()  // requires SonarQube Scanner for Jenkins
            echo "Quality Gate: ${qg.status}"
            if (qg.status != 'OK') {
              error "Pipeline aborted due to Quality Gate status: ${qg.status}"
            }
          }
        }
      }
    }

    stage('Security') {
      parallel {
        stage('Snyk (deps)') {
          when {
            expression { sh(returnStatus: true, script: 'command -v snyk >/dev/null 2>&1') == 0 }
          }
          steps {
            withCredentials([string(credentialsId: 'snyk-token', variable: 'SNYK_TOKEN')]) {
              sh '''
                set -eux
                snyk auth $SNYK_TOKEN
                cd backend
                snyk test || true
              '''
            }
          }
        }
        stage('Trivy (image)') {
          when {
            expression { sh(returnStatus: true, script: 'command -v trivy >/dev/null 2>&1') == 0 &&
                        sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0 }
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

    stage('Deploy') {
      when {
        expression { sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0 }
      }
      steps {
        echo 'Add your deploy steps here (e.g., docker compose up, helm upgrade, etc.).'
      }
    }

    stage('Release') {
      steps {
        echo 'Tag/push images or create GitHub release as needed.'
      }
    }

    stage('Monitoring') {
      steps {
        echo 'Hook in Prometheus/Grafana, uptime checks, etc.'
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
