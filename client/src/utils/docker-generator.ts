
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export class DockerGenerator {
    static async generateDockerPackage(projectFiles: Record<string, any>) {
        const zip = new JSZip();

        // 1. Production Dockerfile (Multi-stage)
        const dockerfile = `
# Stage 1: Build
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm ci if lockfile exists, else npm install)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy build output to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
`;

        // 2. Nginx Configuration (SPA Support)
        const nginxConf = `
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
`;

        // 3. docker-compose.yml
        const dockerCompose = `
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:80"
    restart: always
    environment:
      - NODE_ENV=production
`;

        // 4. README for Docker
        const readme = `
# Self-Hosting with Docker

## Prerequisites
- Docker and Docker Compose installed on your machine.

## Instructions

1.  **Build and Run**:
    \`\`\`bash
    docker-compose up --build -d
    \`\`\`

2.  **Access the App**:
    Open [http://localhost:3000](http://localhost:3000) in your browser.

    *Note: The app runs on port 80 inside the container, mapped to host port 3000.*

3.  **Stop the App**:
    \`\`\`bash
    docker-compose down
    \`\`\`
`;

        zip.file('Dockerfile', dockerfile);
        zip.file('docker-compose.yml', dockerCompose);
        zip.file('nginx.conf', nginxConf);
        zip.file('README-DOCKER.md', readme);

        if (projectFiles) {
            Object.entries(projectFiles).forEach(([path, content]) => {
                // Remove leading slash if present (e.g. /src/App.tsx -> src/App.tsx)
                const cleanPath = path.startsWith('/') ? path.slice(1) : path;

                // Handle file content (string or object with content property)
                const fileContent = typeof content === 'string' ? content : content.content;

                if (fileContent) {
                    zip.file(cleanPath, fileContent);
                }
            });
        }

        // Generate zip
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'project-docker-export.zip');
    }
}
