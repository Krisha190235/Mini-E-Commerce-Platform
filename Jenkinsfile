stage('Docker Build') {
  steps {
    script {
      // Try to login if creds exist; otherwise fall back to anonymous (may rate-limit)
      def loggedIn = false
      try {
        withCredentials([usernamePassword(credentialsId: 'dockerhub',
                                          usernameVariable: 'DOCKERHUB_USR',
                                          passwordVariable: 'DOCKERHUB_PSW')]) {
          sh '''
            echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin
            docker login --username "$DOCKERHUB_USR" --password-stdin <<< "$DOCKERHUB_PSW" >/dev/null 2>&1 || true
          '''
          loggedIn = true
        }
      } catch (e) {
        echo 'DockerHub credentials not configured. Building anonymously (may hit rate limits).'
      }

      sh 'docker build -t ecommerce-api:${BUILD_NUMBER} -t ecommerce-api:latest .'
    }
  }
}

stage('Security') {
  parallel {
    stage('Trivy Image Scan') {
      steps {
        script {
          // Ensure we can pull the base layer for the build in this branch too
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub',
                                              usernameVariable: 'DOCKERHUB_USR',
                                              passwordVariable: 'DOCKERHUB_PSW')]) {
              sh 'echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin'
            }
          } catch (e) {
            echo 'DockerHub credentials not configured for Trivy branch; continuing anonymously.'
          }

          sh '''
            docker build -t ecommerce-api:${BUILD_NUMBER} .
            docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
              aquasec/trivy:latest image \
              --exit-code 1 --severity CRITICAL \
              ecommerce-api:${BUILD_NUMBER} | tee trivy.txt
          '''
        }
      }
      post {
        always { archiveArtifacts artifacts: 'trivy.txt', fingerprint: true }
      }
    }

    // ... Snyk branch unchanged ...
  }
}