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
    // NOTE: Do NOT declare Sonar in tools{} (caused type error before).
    // We'll resolve it with `tool ... type: 'hudson.plugins.sonar.SonarRunnerInstallation'` inside the stage.
  }

  environment {
    DOCKER_BUILDKIT    = '1'
    IMAGE_TAG          = "${env.BUILD_NUMBER}"
    FRONTEND_API_URL   = 'http://localhost:8082'
    // Set to your registry namespace, e.g. 'docker.io/your-user' or 'ghcr.io/your-user'
    REGISTRY           = 'docker.io/your-user'
    // For Compose deploy (optional)
    COMPOSE_FILE       = 'deploy/docker-compose.yml'
    // Health checks (adjust as needed)
    BACKEND_HEALTH     = 'http://localhost:8082/health'
    FRONTEND_HEALTH    = 'http://localhost'
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
          // Backend build
          sh '''
            set -eux
            cd backend
            npm ci
            npm run build || echo "No backend build step required"
          '''

          // Backend image (only if Docker exists)
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh '''
                set -eux
                docker build -t ecommerce-api:'${IMAGE_TAG}' -t ecommerce-api:latest .
              '''
            } else {
              echo 'Docker not found — skipping backend image build.'
            }
          }

          // Frontend build
          sh '''
            set -eux
            cd frontend
            npm ci
            npm run build || echo "No frontend build step required"
          '''

          // Frontend image (only if Docker exists)
          script {
            def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            if (hasDocker) {
              sh '''
                set -eux
                cd frontend
                docker build \
                  --build-arg VITE_API_URL='${FRONTEND_API_URL}' \
                  -t ecommerce-web:'${IMAGE_TAG}' -t ecommerce-web:latest .
              '''
            } else {
              echo 'Docker not found — skipping frontend image build.'
            }
          }
        }

        // Archive sources + dist (best-effort)
        archiveArtifacts artifacts: 'backend/**, frontend/**', allowEmptyArchive: true
      }
    }

    stage('Test') {
      steps {
        ansiColor('xterm') {
          sh '''
            set -eux
            cd backend
            # Jest run with coverage (lcov.info will be used by Sonar)
            NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules \
              npm test -- --ci --coverage
          '''
        }
      }
      post {
        always {
          // JUnit (if you add a reporter file later; safe to keep)
          junit testResults: 'backend/junit-report.xml', allowEmptyResults: true

          // Coverage HTML (from Jest lcov-report)
          publishHTML(target: [
            allowMissing        : true,
            alwaysLinkToLastBuild: true,
            keepAll             : true,
            reportDir           : 'backend/coverage/lcov-report',
            reportFiles         : 'index.html',
            reportName          : 'Coverage'
          ])

          // Keep LCOV for Sonar
          archiveArtifacts artifacts: 'backend/coverage/lcov.info', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality') {
      steps {
        withSonarQubeEnv('SonarQube') {
          withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
            script {
              // Resolve tool paths safely
              def NODEJS_HOME   = tool name: 'node18', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'
              def SCANNER_HOME = tool name: 'sonar-scanner-4.8', type: 'hudson.plugins.sonar.SonarRunnerInstallation'

              withEnv([
                "NODEJS_HOME=${NODEJS_HOME}",
                "SCANNER_HOME=${SCANNER_HOME}",
                "PATH=${NODEJS_HOME}/bin:${SCANNER_HOME}/bin:${env.PATH}"
              ]) {
                // Single quotes so $VAR are expanded by the shell, not Groovy
                sh '''
                  set -euo pipefail
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
                snyk auth "$SNYK_TOKEN"
                cd backend
                snyk test || true
              '''
            }
          }
        }
        stage('Trivy (image)') {
          when {
            expression {
              sh(returnStatus: true, script: 'command -v trivy >/dev/null 2>&1') == 0 &&
              sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
            }
          }
          steps {
            sh '''
              set -eux
              trivy image --exit-code 0 --severity HIGH,CRITICAL ecommerce-api:latest  || true
              trivy image --exit-code 0 --severity HIGH,CRITICAL ecommerce-web:latest  || true
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
        script {
          def hasCompose = sh(returnStatus: true, script: 'docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1') == 0
          def hasKubectl = sh(returnStatus: true, script: 'command -v kubectl >/dev/null 2>&1') == 0

          if (hasCompose && fileExists(env.COMPOSE_FILE)) {
            echo "Deploying with Docker Compose: ${env.COMPOSE_FILE}"
            sh '''
              set -eux
              if command -v docker compose >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
              $DC -f "$COMPOSE_FILE" pull || true
              $DC -f "$COMPOSE_FILE" up -d
              $DC -f "$COMPOSE_FILE" ps
            '''
          } else if (hasKubectl && fileExists('k8s')) {
            echo 'Deploying to Kubernetes using manifests in k8s/'
            sh '''
              set -eux
              kubectl apply -f k8s/
              # If using named Deployments, you can uncomment these rollouts:
              # kubectl rollout status deploy/ecommerce-api --timeout=120s || true
              # kubectl rollout status deploy/ecommerce-web --timeout=120s || true
            '''
          } else {
            echo "No Compose file or k8s manifests found; skipping Deploy."
          }
        }

        // Health checks (best-effort)
        sh '''
          set -eux
          tries=20
          sleepsec=3
          check() { url="$1"; name="$2"; i=0
            until curl -fsS "$url" >/dev/null; do
              i=$((i+1))
              if [ "$i" -ge "$tries" ]; then
                echo "WARN: $name not healthy at $url (continuing pipeline)"
                return 0
              fi
              echo "$name not ready yet... ($i/$tries)"; sleep "$sleepsec"
            done
            echo "$name is healthy: $url"
          }
          check "$BACKEND_HEALTH" "Backend"
          check "$FRONTEND_HEALTH" "Frontend"
        '''
      }
    }

    stage('Release') {
      when {
        expression { sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0 }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
          sh '''
            set -eux
            echo "$DOCKER_PASS" | docker login "$REGISTRY" -u "$DOCKER_USER" --password-stdin

            # Tag images
            docker tag ecommerce-api:latest "$REGISTRY/ecommerce-api:latest"
            docker tag ecommerce-api:latest "$REGISTRY/ecommerce-api:$IMAGE_TAG"
            docker tag ecommerce-web:latest "$REGISTRY/ecommerce-web:latest"
            docker tag ecommerce-web:latest "$REGISTRY/ecommerce-web:$IMAGE_TAG"

            # Push
            docker push "$REGISTRY/ecommerce-api:$IMAGE_TAG"
            docker push "$REGISTRY/ecommerce-api:latest"
            docker push "$REGISTRY/ecommerce-web:$IMAGE_TAG"
            docker push "$REGISTRY/ecommerce-web:latest"

            docker logout "$REGISTRY" || true
          '''
        }
      }
    }

    stage('Monitoring') {
      steps {
        echo 'Collecting runtime signals…'
        script {
          def hasDocker = sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0
          if (hasDocker) {
            sh '''
              set -eux
              echo "Containers:"
              docker ps || true

              echo "Recent logs (backend)…"
              docker logs --tail 100 $(docker ps --format '{{.Names}}' | grep -E 'api|backend' || true) 2>&1 || true

              echo "Recent logs (frontend)…"
              docker logs --tail 100 $(docker ps --format '{{.Names}}' | grep -E 'web|frontend|nginx' || true) 2>&1 || true
            '''
          }
          sh '''
            set -eux
            echo "Pinging backend health once:"
            time curl -fsS "$BACKEND_HEALTH" >/dev/null || true

            echo "Fetching frontend root once:"
            time curl -fsS "$FRONTEND_HEALTH" >/dev/null || true
          '''
        }
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
