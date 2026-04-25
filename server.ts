import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, startAfter, where } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Setup
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function startServer() {
  const server = express();
  const PORT = 5173;

  server.use(express.json());

  // --- API Routes ---

  // Health Check
  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Get All Drivers (Paginated & Searchable)
  server.get('/api/getDrivers', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '', onboardingStatus = 'all' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);
      
      // Fetch all to sort and filter in memory to avoid mandatory composite indexes
      const q = query(collection(db, 'drivers'), orderBy('onboarded_on', 'desc'));
      const snapshot = await getDocs(q);
      let drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Onboarding Status Filter
      if (onboardingStatus && onboardingStatus !== 'all') {
        drivers = drivers.filter((d: any) => d.onboardingStatus === onboardingStatus);
      }

      // Search Filter
      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        drivers = drivers.filter((d: any) => 
          (d.name?.toLowerCase().includes(lowerQ)) || 
          (d.phone?.includes(lowerQ)) || 
          (d.driver_id?.toLowerCase().includes(lowerQ))
        );
      }

      const total = drivers.length;
      const startIndex = (pageNum - 1) * limitCount;
      const paginatedDrivers = drivers.slice(startIndex, startIndex + limitCount);

      res.json({ 
        drivers: paginatedDrivers, 
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Inventory Items (Paginated & Searchable)
  server.get('/api/getInventory', async (req, res) => {
    try {
      const { typeId, page = '1', count = '20', search = '' } = req.query;
      if (!typeId) return res.status(400).json({ error: 'typeId is required' });
      
      const limitCount = Number(count);
      const pageNum = Number(page);
      
      const q = query(collection(db, 'inventory_items'), where('typeId', '==', typeId));
      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        items = items.filter((it: any) => 
          Object.values(it.data || {}).some(val => String(val).toLowerCase().includes(lowerQ))
        );
      }

      const total = items.length;
      const startIndex = (pageNum - 1) * limitCount;
      const paginatedItems = items.slice(startIndex, startIndex + limitCount);

      res.json({ 
        items: paginatedItems, 
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Tickets (Searchable and Date Filtered)
  server.get('/api/getTickets', async (req, res) => {
    try {
      const { status = 'All', search = '', dateRange = 'today', startDate, endDate } = req.query;

      let ticketsQuery = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));

      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      if (dateRange === 'today') {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (dateRange === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday.setHours(0, 0, 0, 0));
        end = new Date(yesterday.setHours(23, 59, 59, 999));
      } else if (dateRange === 'last7days') {
        start = new Date();
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
      } else if (dateRange === 'last30days') {
        start = new Date();
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
      } else if (dateRange === 'thisMonth') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === 'lastMonth') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (dateRange === 'custom' && startDate && endDate) {
        start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
      }

      if (start) {
        ticketsQuery = query(ticketsQuery, where('createdAt', '>=', start.toISOString()));
      }
      if (end) {
        ticketsQuery = query(ticketsQuery, where('createdAt', '<=', end.toISOString()));
      }

      const snapshot = await getDocs(ticketsQuery);
      let tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (status !== 'All') {
        tickets = tickets.filter((t: any) => t.status === status);
      }

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        tickets = tickets.filter((t: any) => 
          (t.driverName?.toLowerCase().includes(lowerQ)) || 
          (t.driverId?.toLowerCase().includes(lowerQ)) ||
          (t.vehicleNumber?.toLowerCase().includes(lowerQ)) ||
          (t.id?.toLowerCase().includes(lowerQ))
        );
      }

      res.json({ 
        tickets, 
        total: tickets.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Stations (Paginated)
  server.get('/api/getStations', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const snapshot = await getDocs(collection(db, 'stations'));
      let stations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        stations = stations.filter((s: any) => 
          (s.name?.toLowerCase().includes(lowerQ)) || (s.location?.toLowerCase().includes(lowerQ))
        );
      }

      const total = stations.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        stations: stations.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get ID Cards (Paginated)
  server.get('/api/getIDCards', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const snapshot = await getDocs(collection(db, 'id_cards'));
      let cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        cards = cards.filter((c: any) => 
          (c.driverName?.toLowerCase().includes(lowerQ)) || (c.driverId?.toLowerCase().includes(lowerQ))
        );
      }

      const total = cards.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        cards: cards.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Cash Collections (Paginated)
  server.get('/api/getCashCollections', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const snapshot = await getDocs(collection(db, 'cash_collections'));
      let collections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Sort in memory to avoid index issues and handle missing createdAt fields in old data
      collections.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.timestamp || a.date).getTime();
        const dateB = new Date(b.createdAt || b.timestamp || b.date).getTime();
        return dateB - dateA;
      });

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        collections = collections.filter((c: any) => 
          (c.stationName?.toLowerCase().includes(lowerQ)) || (c.id?.toLowerCase().includes(lowerQ))
        );
      }

      const total = collections.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        collections: collections.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Ticket Alerts (Open tickets > 2 days old)
  server.get('/api/getTicketAlerts', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Fetch all non-closed tickets. Since we can't use != without composite index when sorting by other fields, 
      // we'll fetch recently created tickets and filter/sort in memory to ensure it works without manual index creation.
      const snapshot = await getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(1000)));
      let tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Filter: status != 'Closed' AND older than 2 days
      tickets = tickets.filter(t => t.status !== 'Closed' && new Date(t.createdAt) < twoDaysAgo);

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        tickets = tickets.filter((t: any) => 
          (t.driverName?.toLowerCase().includes(lowerQ)) || (t.driverId?.toLowerCase().includes(lowerQ)) || (t.id?.toLowerCase().includes(lowerQ))
        );
      }

      const total = tickets.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        alerts: tickets.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Swap Alerts (Assigned drivers not swapped in >= 4 days)
  server.get('/api/getSwapAlerts', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const fourDaysAgo = new Date();
      fourDaysAgo.setHours(0, 0, 0, 0);
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const q = query(collection(db, 'drivers'), where('assigned', '==', true));
      const snapshot = await getDocs(q);
      let drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Filter by last swap >= 4 days ago
      drivers = drivers.filter(d => {
        if (!d.last_swap_date || d.last_swap_date === 0) return true;
        const swapMs = d.last_swap_date > 100000000000 ? d.last_swap_date : d.last_swap_date * 1000;
        const swapDate = new Date(swapMs);
        swapDate.setHours(0, 0, 0, 0);
        return swapDate.getTime() <= fourDaysAgo.getTime();
      });

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        drivers = drivers.filter((d: any) => 
          (d.name?.toLowerCase().includes(lowerQ)) || (d.driver_id?.toLowerCase().includes(lowerQ))
        );
      }

      const total = drivers.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        alerts: drivers.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Swapping Sessions
  server.get('/api/getSwappingSessions', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const snapshot = await getDocs(query(collection(db, 'swapping_sessions'), orderBy('startTime', 'desc')));
      let sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        sessions = sessions.filter((s: any) => 
          (s.driverName?.toLowerCase().includes(lowerQ)) || (s.driverId?.toLowerCase().includes(lowerQ))
        );
      }

      const total = sessions.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        sessions: sessions.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get User Management
  server.get('/api/getUsers', async (req, res) => {
    try {
      const { page = '1', count = '10', search = '' } = req.query;
      const limitCount = Number(count);
      const pageNum = Number(page);

      const snapshot = await getDocs(collection(db, 'users'));
      let users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (search && search !== 'undefined') {
        const lowerQ = String(search).toLowerCase();
        users = users.filter((u: any) => 
          (u.name?.toLowerCase().includes(lowerQ)) || (u.email?.toLowerCase().includes(lowerQ))
        );
      }

      const total = users.length;
      const startIndex = (pageNum - 1) * limitCount;
      res.json({ 
        users: users.slice(startIndex, startIndex + limitCount),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitCount)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Vite / Frontend Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    server.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    server.use(express.static(distPath));
    server.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
