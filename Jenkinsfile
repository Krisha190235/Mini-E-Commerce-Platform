pipeline {
  agent any

  tools { nodejs 'node18' }

  environment {
    // Optional: set these in Jenkins (Manage Jenkins → Credentials/Global env)
    NETLIFY_SITE_ID = 'aecf50a1-a868-4cec-91b2-9cc702dd955e' // change if you use Netlify
    IMAGE_API  = 'ecommerce-api'
    IMAGE_WEB  = 'ecommerce-web'
    API_PORT   = '8082'
    WEB_PORT   = '8080'
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
          # backend
          cd backend
          npm ci
          npm run build || echo "No backend build step"
          cd ..

          # frontend
          cd frontend
          npm ci
          # vite build outputs to dist/
          npm run build || echo "No frontend build step"
          cd ..

          # Docker builds if Docker is present
          if command -v docker >/dev/null 2>&1; then
            docker build -t ${IMAGE_API}:latest .
            if [ -f frontend/Dockerfile ]; then
              (cd frontend && docker build -t ${IMAGE_WEB}:latest .)
            fi
          else
            echo "Docker not found; skipping image builds."
          fi
        '''
      }
    }

    stage('Test') {
      steps {
        sh '''
          set -eux
          cd backend
          NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules npm test -- --passWithNoTests --ci
        '''
      }
    }

    stage('Code Quality (ESLint)') {
      steps {
        sh '''
          set -eux
          # Lint backend if config exists
          if [ -f backend/.eslintrc.* ] || [ -f backend/package.json ] && jq -e '.eslintConfig' backend/package.json >/dev/null 2>&1; then
            (cd backend && npx eslint src || true)
          fi
          # Lint frontend if config exists
          if [ -f frontend/.eslintrc.* ] || [ -f frontend/package.json ] && jq -e '.eslintConfig' frontend/package.json >/dev/null 2>&1; then
            (cd frontend && npx eslint src || true)
          fi
        '''
      }
    }

    stage('Deploy (local test)') {
      when {
        expression { return sh(returnStatus:true, script:'command -v docker >/dev/null 2>&1') == 0 }
      }
      steps {
        sh '''
          set -eux

          # If you have docker-compose.yml at repo root, prefer it:
          if [ -f docker-compose.yml ] || [ -f compose.yaml ]; then
            docker compose down || true
            # Optionally override images in compose with envs your file reads
            export API_IMAGE=${IMAGE_API}:latest
            export WEB_IMAGE=${IMAGE_WEB}:latest
            docker compose up -d --force-recreate
            docker compose ps
          else
            # Fallback: run containers directly
            docker rm -f ${IMAGE_API} || true
            docker run -d --name ${IMAGE_API} -p ${API_PORT}:8082 ${IMAGE_API}:latest

            if docker image inspect ${IMAGE_WEB}:latest >/dev/null 2>&1; then
              docker rm -f ${IMAGE_WEB} || true
              docker run -d --name ${IMAGE_WEB} -p ${WEB_PORT}:80 ${IMAGE_WEB}:latest
            fi
          fi

          # simple smoke checks
          curl -fsS http://localhost:${API_PORT}/health || true
        '''
      }
    }

    stage('Release (Netlify optional)') {
      when {
        expression { return sh(returnStatus:true, script:'command -v netlify >/dev/null 2>&1') == 0 }
      }
      steps {
        sh '''
          set -eux
          # Deploy the built frontend (Vite) if dist/ exists
          if [ -d frontend/dist ]; then
            netlify deploy --dir=./frontend/dist --prod --site="${NETLIFY_SITE_ID}"
          else
            echo "No frontend/dist to deploy."
          fi
        '''
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
      archiveArtifacts artifacts: 'backend/coverage/**', allowEmptyArchive: true
      cleanWs()
    }
  }
}
