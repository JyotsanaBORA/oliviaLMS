/**
 * Optimized Socket.IO utility for lead management system
 * Reduces overhead by throttling events and targeting specific users
 */

const cacheInvalidator = require('./cacheInvalidator');

class SocketOptimizer {
  constructor(io) {
    this.io = io;
    this.eventThrottle = new Map(); // Throttle map for events
    this.userSockets = new Map(); // Track user -> socket mappings
    this.throttleDelay = 1000; // 1 second throttle
  }

  /**
   * Register a user's socket connection
   * @param {string} socket - Socket instance
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @param {string} organizationId - Organization ID
   */
  registerUser(socket, userId, userRole, organizationId) {
    const userKey = `${userId}_${userRole}`;
    
    if (!this.userSockets.has(userKey)) {
      this.userSockets.set(userKey, []);
    }
    
    this.userSockets.get(userKey).push({
      socket,
      organizationId,
      connectedAt: Date.now()
    });

    console.log(`Registered user ${userId} (${userRole}) with socket ${socket.id}`);
  }

  /**
   * Unregister a user's socket connection
   * @param {string} socket - Socket instance
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   */
  unregisterUser(socket, userId, userRole) {
    const userKey = `${userId}_${userRole}`;
    const userSockets = this.userSockets.get(userKey);
    
    if (userSockets) {
      const filtered = userSockets.filter(s => s.socket.id !== socket.id);
      if (filtered.length === 0) {
        this.userSockets.delete(userKey);
      } else {
        this.userSockets.set(userKey, filtered);
      }
    }

    console.log(`Unregistered socket ${socket.id} for user ${userId} (${userRole})`);
  }

  /**
   * Throttled event emission to prevent spam
   * @param {string} eventKey - Unique event identifier
   * @param {function} emitFunction - Function to call for emission
   */
  throttledEmit(eventKey, emitFunction) {
    const now = Date.now();
    const lastEmit = this.eventThrottle.get(eventKey);
    
    if (!lastEmit || (now - lastEmit) >= this.throttleDelay) {
      this.eventThrottle.set(eventKey, now);
      emitFunction();
    }
  }

  /**
   * Emit lead update to relevant users only
   * @param {object} lead - Lead document
   * @param {string} eventType - Type of event (created, updated, deleted, assigned)
   * @param {object} user - User who triggered the event
   */
  emitLeadUpdate(lead, eventType, user) {
    const eventKey = `lead_${eventType}_${lead._id}`;
    
    this.throttledEmit(eventKey, () => {
      // Emit to admins and superadmins of the lead's organization
      this.emitToOrganizationAdmins(lead.organization, 'leadUpdate', {
        lead,
        eventType,
        timestamp: new Date().toISOString(),
        updatedBy: user.name
      });

      // Emit to assigned Agent2 if applicable
      if (lead.assignedTo) {
        this.emitToUser(lead.assignedTo, 'agent2', 'persistentLeadUpdate', {
          lead,
          eventType,
          timestamp: new Date().toISOString()
        });
      }

      // Emit to lead creator
      if (lead.createdBy && lead.createdBy.toString() !== user._id.toString()) {
        this.emitToUser(lead.createdBy, 'agent1', 'leadUpdate', {
          lead,
          eventType,
          timestamp: new Date().toISOString()
        });
      }

      // Invalidate relevant caches
      cacheInvalidator.invalidateLeadRelatedCaches(lead, user);
    });
  }

  /**
   * Emit dashboard stats refresh to specific user
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   */
  emitDashboardRefresh(userId, userRole) {
    const eventKey = `dashboard_${userId}_${userRole}`;
    
    this.throttledEmit(eventKey, () => {
      this.emitToUser(userId, userRole, 'dashboardRefresh', {
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Emit to all admins of a specific organization
   * @param {string} organizationId - Organization ID
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  emitToOrganizationAdmins(organizationId, event, data) {
    for (const [userKey, sockets] of this.userSockets.entries()) {
      const [, role] = userKey.split('_');
      
      if (role === 'admin' || role === 'superadmin') {
        sockets.forEach(socketInfo => {
          if (role === 'superadmin' || socketInfo.organizationId === organizationId) {
            socketInfo.socket.emit(event, data);
          }
        });
      }
    }
  }

  /**
   * Emit to specific user
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  emitToUser(userId, userRole, event, data) {
    const userKey = `${userId}_${userRole}`;
    const userSockets = this.userSockets.get(userKey);
    
    if (userSockets) {
      userSockets.forEach(socketInfo => {
        socketInfo.socket.emit(event, data);
      });
    }
  }

  /**
   * Broadcast to all connected users
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  broadcastToAll(event, data) {
    const eventKey = `broadcast_${event}`;
    
    this.throttledEmit(eventKey, () => {
      this.io.emit(event, data);
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const totalConnections = Array.from(this.userSockets.values())
      .reduce((sum, sockets) => sum + sockets.length, 0);
    
    return {
      totalUsers: this.userSockets.size,
      totalConnections,
      throttledEvents: this.eventThrottle.size,
      userBreakdown: Array.from(this.userSockets.entries()).map(([userKey, sockets]) => ({
        userKey,
        connections: sockets.length
      }))
    };
  }

  /**
   * Clean up old throttle entries
   */
  cleanupThrottle() {
    const now = Date.now();
    for (const [key, timestamp] of this.eventThrottle.entries()) {
      if ((now - timestamp) > (this.throttleDelay * 5)) { // Keep for 5x throttle delay
        this.eventThrottle.delete(key);
      }
    }
  }
}

module.exports = SocketOptimizer;