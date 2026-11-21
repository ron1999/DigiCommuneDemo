import 'dotenv/config';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { createServer } from 'http';
import { TownRoom } from './TownRoom';
import { authConfigured } from './auth';

const port = Number(process.env.PORT) || 2567;

if (!authConfigured()) {
  console.warn(
    '\n*** WARNING: SUPABASE_URL / SUPABASE_ANON_KEY are missing in server/.env. ' +
      'Nobody will be able to join until you add them. ***\n',
  );
}

const app = express();
app.get('/', (_req, res) => {
  res.send('DigiCommune server is running');
});

const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

// One shared town that everyone joins, and one home per player (matched by owner)
gameServer.define('town', TownRoom);
gameServer.define('home', TownRoom).filterBy(['owner']);

gameServer.listen(port).then(() => {
  console.log('DigiCommune server listening on port ' + port);
});
