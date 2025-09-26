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
    // Manage Jenkins → Tools → NodeJS; name this installation "node18"
    nodejs 'node18'
    // Do NOT declare sonarQubeScanner here (wrong tool type). We'll resolve the scanner with `tool()` later.
  }

  environment {
    DOCKER_BUILDKIT = '1'
    IMAGE_TAG       = "${env.BUILD_NUMBER}"
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
          // ---- Backend (Node) build / prep ----
          sh '''
            set -eux
            cd backend
            npm ci
            npm run build || echo "No build step required"
          '''

          // ---- Backend image (if Docker available) ----
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh '''
                set -eux
                docker build -t ecommerce-api:$IMAGE_TAG -t ecommerce-api:latest .
              '''
            } else {
              echo 'Docker not found on this agent — skipping backend image build.'
            }
          }

          // ---- Frontend build + image ----
          sh '''
            set -eux
            cd frontend
            npm ci
          '''
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh '''
                set -eux
                cd frontend
                docker build \
                  --build-arg VITE_API_URL=$FRONTEND_API_URL \
                  -t ecommerce-web:$IMAGE_TAG -t ecommerce-web:latest .
              '''
            } else {
              echo 'Docker not found on this agent — skipping frontend image build.'
            }
          }
        }

        // Keep some outputs for later stages / artifacts browser
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
          // JUnit (if/when you emit XML). Safe to leave even if empty.
          junit testResults: 'backend/junit-report.xml', allowEmptyResults: true

          // HTML coverage report
          publishHTML(target: [
            allowMissing: true,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: 'backend/coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: 'Coverage'
          ])

          // LCOV for Sonar
          archiveArtifacts artifacts: 'backend/coverage/lcov.info', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality') {
      steps {
        // Use the configured SonarQube server called "SonarQube"
        withSonarQubeEnv('SonarQube') {
          withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
            // Resolve tool homes at runtime
            script {
              env.NODEJS_HOME = tool name: 'node18', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'
              env.SCANNER_HOME = tool name: 'sonar-scanner-4.8', type: 'hudson.plugins.sonar.SonarRunnerInstallation'
            }
            // IMPORTANT: single quotes so $VARS expand in the shell, not in Groovy
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

    stage('Quality Gate') {
      steps {
        script {
          timeout(time: 5, unit: 'MINUTES') {
            def qg = waitForQualityGate()
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
            expression {
              sh(returnStatus: true, script: 'command -v trivy  >/dev/null 2>&1') == 0 &&
              sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            }
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
        // Your requested message:
        echo 'Add your deploy steps here (e.g., docker compose up, helm upgrade, etc.).'

        // Example: docker compose if a compose file exists
        sh '''
          set -eux
          if [ -f docker-compose.yml ] || [ -f compose.yml ]; then
            docker compose pull || true
            docker compose up -d
          else
            echo "No docker-compose.yml found — skipping compose deploy."
          fi
        '''
      }
    }

    stage('Release') {
      steps {
        // Your requested message:
        echo 'Tag/push images or create GitHub release as needed.'

        // Example: push images to Docker Hub if creds available & docker is present
        script {
          def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
          if (hasDocker) {
            withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
              sh '''
                set -eux
                echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin || true

                # Tag and push (replace "yourrepo" with your Docker Hub repo name if different)
                docker tag ecommerce-api:latest yourrepo/ecommerce-api:latest || true
                docker tag ecommerce-api:$IMAGE_TAG yourrepo/ecommerce-api:$IMAGE_TAG || true
                docker tag ecommerce-web:latest yourrepo/ecommerce-web:latest || true
                docker tag ecommerce-web:$IMAGE_TAG yourrepo/ecommerce-web:$IMAGE_TAG || true

                docker push yourrepo/ecommerce-api:latest || true
                docker push yourrepo/ecommerce-api:$IMAGE_TAG || true
                docker push yourrepo/ecommerce-web:latest || true
                docker push yourrepo/ecommerce-web:$IMAGE_TAG || true
              '''
            }
          } else {
            echo 'Docker not found — skipping image publish.'
          }
        }
      }
    }

    stage('Monitoring') {
      steps {
        // Your requested message:
        echo 'Hook in Prometheus/Grafana, uptime checks, etc.'
        // Placeholder: you can curl a health endpoint, or post to a monitoring webhook here.
        sh '''
          set -eux
          echo "Monitoring step placeholder (add your probes/webhooks here)"
        '''
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
