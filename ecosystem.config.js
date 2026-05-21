// backend/ecosystem.config.js
/**
 * PM2 Application Configuration File
 * Used to run Worklife in production high-availability cluster mode.
 * 
 * Command to start: pm2 start ecosystem.config.js --env production
 * Command to show status: pm2 status
 * Command to show logs: pm2 logs worklife
 */
module.exports = {
  apps: [
    {
      name: 'worklife',
      script: 'server.js',
      instances: 'max',             // Scales the app to use all available CPU cores automatically
      exec_mode: 'cluster',         // Enables cluster mode for high availability (zero downtime reload)
      watch: false,                 // Do not reload code changes in production
      max_memory_restart: '1G',     // Safely restart instances if memory footprint leaks above 1GB
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
