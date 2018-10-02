const WebSocketServer = require('ws').Server;
const http = require('http');
const express = require('express');
const url = require('url');

const app = express();
app.use(express.static('public'))
const port = 5000;

const server = http.createServer(app);
server.listen(port, () => console.log(`http server listening on port ${port}`));

const wss = new WebSocketServer({server: server});
console.log('websocket server created');

var users = {};

wss.on('connection', ws => {
  console.log('websocket connection open');

  ws.on('close', () => {
    console.log('websocket connection close')
    Object.keys(users).forEach(key => {
      if (users[key] === ws) {
        console.log(`User removed: ${key}`);
        delete users.key
      }
    });
  });

  ws.on('message', message => {
    const m = JSON.parse(message);
    console.info(`${m.fom} => ${m.to}: ${m.command}`);
    switch (m.command) {
      case 'REGISTER':
        users[m.from] = ws;
        console.info(`User connected: ${m.from}`);
        break;
      case 'INVITE':
      case 'ANSWER':
      case 'CANDIDATE':
      case 'HANGUP':
        if (users.hasOwnProperty(m.to)) {
          users[m.to].send(message);
        } else {
          console.info(`User ${m.to} is not registered`);
        }
        break;
      default:
        console.warn(`Invalid command: ${m.command}`);
    }
  });
});
