import { listen } from '@colyseus/tools';
import app from './app.config';

// Listens on PORT (default 2567) for both HTTP and WebSocket traffic.
listen(app);
