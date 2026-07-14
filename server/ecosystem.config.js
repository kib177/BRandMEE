module.exports = {
  apps: [{
    name: 'server',
    script: 'server.js',
    cwd: '/opt/warehouse/server',
    env_file: '.env',        
    watch: false,
    autorestart: true
  }]
};
