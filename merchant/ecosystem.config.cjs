module.exports = {
  apps: [
    {
      name: "tinkerbell-partner",
      cwd: __dirname,
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "-r dotenv/config",
      watch: false,
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      env_production: {
        NODE_ENV: "production",
        DOTENV_CONFIG_PATH: ".env.production",
      },
    },
  ],
};
