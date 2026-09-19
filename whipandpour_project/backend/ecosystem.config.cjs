module.exports = {
  apps: [
    {
      name: 'whipandpour-backend',
      script: 'python',
      args: 'main.py',
      cwd: '/home/user/whipandpour_project/backend',
      env: {
        PORT: '8000',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    }
  ]
}
