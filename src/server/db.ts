import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import {
  UserModel,
  ComplaintModel,
  DepartmentModel,
  NotificationModel,
  AnnouncementModel,
  AuditLogModel,
  CollegeRosterModel,
  EmailVerificationModel,
  PendingRegistrationModel,
} from './models';

export interface MongoHealthStatus {
  connected: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'unconfigured';
  readyState: number;
  uriConfigured: boolean;
  pingLatencyMs: number | null;
  host?: string;
  databaseName?: string;
  error: string | null;
  checkedAt: string;
}

export interface ConnectionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface DatabaseAdapter {
  isConnected: boolean;
  connectionError: string | null;
  mongoUriConfigured: boolean;
  users: CollectionStore<any>;
  complaints: CollectionStore<any>;
  departments: CollectionStore<any>;
  notifications: CollectionStore<any>;
  announcements: CollectionStore<any>;
  auditLogs: CollectionStore<any>;
  roster: CollectionStore<any>;
  emailVerifications: CollectionStore<any>;
  pendingRegistrations: CollectionStore<any>;
  init(): Promise<void>;
  connectAndVerify(options?: ConnectionOptions): Promise<{ success: boolean; latencyMs?: number; error?: string }>;
  checkPing(): Promise<{ ok: boolean; latencyMs: number | null; error: string | null }>;
  getHealthStatus(): Promise<MongoHealthStatus>;
  disconnect(): Promise<void>;
}

export interface CollectionStore<T> {
  find(query?: any): Promise<T[]>;
  findOne(query: any): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  create(doc: Partial<T>): Promise<T>;
  updateOne(query: any, update: any): Promise<boolean>;
  updateById(id: string, update: any): Promise<T | null>;
  deleteOne(query: any): Promise<boolean>;
  deleteById(id: string): Promise<boolean>;
  count(query?: any): Promise<number>;
}

class MongooseCollection<T> implements CollectionStore<T> {
  private model: mongoose.Model<any>;
  private checkConnected: () => boolean;
  private getError: () => string | null;

  constructor(
    model: mongoose.Model<any>,
    checkConnected: () => boolean,
    getError: () => string | null
  ) {
    this.model = model;
    this.checkConnected = checkConnected;
    this.getError = getError;
  }

  private ensureConnected(): void {
    if (!this.checkConnected()) {
      const err = this.getError() || 'MongoDB is not connected. Please verify MONGODB_URI and MongoDB server status.';
      throw new Error(`[Database Error] MongoDB connection required: ${err}`);
    }
  }

  async find(query?: any): Promise<T[]> {
    this.ensureConnected();
    return this.model.find(query || {}).lean().exec() as any;
  }

  async findOne(query: any): Promise<T | null> {
    this.ensureConnected();
    return this.model.findOne(query).lean().exec() as any;
  }

  async findById(id: string): Promise<T | null> {
    this.ensureConnected();
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { id }, { complaintId: id }] }
      : { $or: [{ id }, { complaintId: id }] };
    return this.model.findOne(query).lean().exec() as any;
  }

  async create(doc: Partial<T>): Promise<T> {
    this.ensureConnected();
    const created = await this.model.create(doc);
    return created.toObject ? created.toObject() : (created as any);
  }

  async updateOne(query: any, update: any): Promise<boolean> {
    this.ensureConnected();
    const res = await this.model.updateOne(query, { $set: update });
    return res.modifiedCount > 0 || res.matchedCount > 0;
  }

  async updateById(id: string, update: any): Promise<T | null> {
    this.ensureConnected();
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { id }, { complaintId: id }] }
      : { $or: [{ id }, { complaintId: id }] };
    return this.model.findOneAndUpdate(query, { $set: update }, { new: true }).lean().exec() as any;
  }

  async deleteOne(query: any): Promise<boolean> {
    this.ensureConnected();
    const res = await this.model.deleteOne(query);
    return (res.deletedCount || 0) > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    this.ensureConnected();
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { id }, { complaintId: id }] }
      : { $or: [{ id }, { complaintId: id }] };
    const res = await this.model.deleteOne(query);
    return (res.deletedCount || 0) > 0;
  }

  async count(query?: any): Promise<number> {
    this.ensureConnected();
    return this.model.countDocuments(query || {});
  }
}

class DatabaseManager implements DatabaseAdapter {
  isConnected: boolean = false;
  connectionError: string | null = null;
  mongoUriConfigured: boolean = false;

  users: CollectionStore<any>;
  complaints: CollectionStore<any>;
  departments: CollectionStore<any>;
  notifications: CollectionStore<any>;
  announcements: CollectionStore<any>;
  auditLogs: CollectionStore<any>;
  roster: CollectionStore<any>;
  emailVerifications: CollectionStore<any>;
  pendingRegistrations: CollectionStore<any>;

  constructor() {
    const isConn = () => this.isConnected;
    const getErr = () => this.connectionError;

    this.users = new MongooseCollection<any>(UserModel, isConn, getErr);
    this.complaints = new MongooseCollection<any>(ComplaintModel, isConn, getErr);
    this.departments = new MongooseCollection<any>(DepartmentModel, isConn, getErr);
    this.notifications = new MongooseCollection<any>(NotificationModel, isConn, getErr);
    this.announcements = new MongooseCollection<any>(AnnouncementModel, isConn, getErr);
    this.auditLogs = new MongooseCollection<any>(AuditLogModel, isConn, getErr);
    this.roster = new MongooseCollection<any>(CollegeRosterModel, isConn, getErr);
    this.emailVerifications = new MongooseCollection<any>(EmailVerificationModel, isConn, getErr);
    this.pendingRegistrations = new MongooseCollection<any>(PendingRegistrationModel, isConn, getErr);
  }

  private isListenersRegistered: boolean = false;

  private registerConnectionListeners(): void {
    if (this.isListenersRegistered) return;
    this.isListenersRegistered = true;

    mongoose.connection.on('connected', () => {
      this.isConnected = true;
      this.connectionError = null;
      console.log('[DB Lifecycle] Mongoose connected event fired.');
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      this.connectionError = 'MongoDB connection lost (disconnected event).';
      console.warn('[DB Lifecycle] Mongoose disconnected event fired.');
    });

    mongoose.connection.on('error', (err: any) => {
      this.isConnected = false;
      this.connectionError = err?.message || String(err);
      console.error('[DB Lifecycle] Mongoose connection error event:', this.connectionError);
    });

    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      this.connectionError = null;
      console.log('[DB Lifecycle] Mongoose reconnected event fired.');
    });
  }

  async checkPing(): Promise<{ ok: boolean; latencyMs: number | null; error: string | null }> {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return {
        ok: false,
        latencyMs: null,
        error: this.connectionError || 'MongoDB is not in connected state (readyState !== 1).',
      };
    }

    try {
      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const latencyMs = Date.now() - startTime;
      return { ok: true, latencyMs, error: null };
    } catch (err: any) {
      this.isConnected = false;
      this.connectionError = `Database ping command failed: ${err.message || String(err)}`;
      return { ok: false, latencyMs: null, error: this.connectionError };
    }
  }

  async getHealthStatus(): Promise<MongoHealthStatus> {
    const readyState = mongoose.connection.readyState;
    const stateMap: Record<number, 'disconnected' | 'connected' | 'connecting' | 'disconnecting'> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    const currentStatus = !this.mongoUriConfigured ? 'unconfigured' : stateMap[readyState] || 'disconnected';

    let pingLatencyMs: number | null = null;
    let pingError: string | null = null;

    if (readyState === 1 && mongoose.connection.db) {
      const pingRes = await this.checkPing();
      pingLatencyMs = pingRes.latencyMs;
      if (!pingRes.ok) {
        pingError = pingRes.error;
      }
    }

    const isFullyConnected = this.isConnected && readyState === 1 && pingError === null;

    return {
      connected: isFullyConnected,
      status: currentStatus,
      readyState,
      uriConfigured: this.mongoUriConfigured,
      pingLatencyMs,
      host: mongoose.connection.host || undefined,
      databaseName: mongoose.connection.name || undefined,
      error: pingError || this.connectionError,
      checkedAt: new Date().toISOString(),
    };
  }

  async connectAndVerify(options?: ConnectionOptions): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    this.registerConnectionListeners();

    const mongoUri = process.env.MONGODB_URI;
    this.mongoUriConfigured = Boolean(mongoUri);

    if (!mongoUri) {
      this.isConnected = false;
      this.connectionError = 'MONGODB_URI environment variable is not defined.';
      return { success: false, error: this.connectionError };
    }

    const maxRetries = options?.maxRetries ?? 3;
    const retryDelayMs = options?.retryDelayMs ?? 1500;
    const timeoutMs = options?.timeoutMs ?? 5000;

    let lastError = 'Unknown connection failure';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[DB] Establishing robust connection check (attempt ${attempt}/${maxRetries})...`);

        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
          const pingResult = await this.checkPing();
          if (pingResult.ok) {
            this.isConnected = true;
            this.connectionError = null;
            await this.migrateLegacyDataIfEmpty();
            return { success: true, latencyMs: pingResult.latencyMs ?? 0 };
          }
        }

        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: timeoutMs,
            connectTimeoutMS: timeoutMs,
          });
        }

        const ping = await this.checkPing();
        if (ping.ok) {
          this.isConnected = true;
          this.connectionError = null;
          console.log(`[DB] MongoDB connection check passed (ping: ${ping.latencyMs}ms). Host: ${mongoose.connection.host}, DB: ${mongoose.connection.name}`);
          await this.migrateLegacyDataIfEmpty();
          return { success: true, latencyMs: ping.latencyMs ?? 0 };
        } else {
          throw new Error(ping.error || 'Ping verification returned non-ok response.');
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        this.isConnected = false;
        this.connectionError = lastError;
        console.warn(`[DB] Connection check attempt ${attempt}/${maxRetries} failed: ${lastError}`);

        if (attempt < maxRetries) {
          console.log(`[DB] Waiting ${retryDelayMs}ms before retrying connection...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    return { success: false, error: lastError };
  }

  async init(): Promise<void> {
    await this.connectAndVerify({ maxRetries: 1, timeoutMs: 5000 });
  }

  private async migrateLegacyDataIfEmpty(): Promise<void> {
    try {
      const legacyPath = path.resolve(process.cwd(), '.data', 'campus_care_db.json');
      if (!fs.existsSync(legacyPath)) return;

      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const data = JSON.parse(raw);

      // Check if user collection in MongoDB is empty
      const userCount = await UserModel.countDocuments();
      if (userCount === 0 && Array.isArray(data.users) && data.users.length > 0) {
        console.log(`[DB Migration] Migrating ${data.users.length} legacy user records to MongoDB...`);
        for (const u of data.users) {
          const { _id, ...userData } = u;
          await UserModel.findOneAndUpdate(
            { identifier: userData.identifier },
            { $set: userData },
            { upsert: true }
          );
        }
      }

      const complaintCount = await ComplaintModel.countDocuments();
      if (complaintCount === 0 && Array.isArray(data.complaints) && data.complaints.length > 0) {
        console.log(`[DB Migration] Migrating ${data.complaints.length} legacy complaint records to MongoDB...`);
        for (const c of data.complaints) {
          const { _id, ...complaintData } = c;
          await ComplaintModel.findOneAndUpdate(
            { complaintId: complaintData.complaintId },
            { $set: complaintData },
            { upsert: true }
          );
        }
      }

      console.log('[DB Migration] Legacy data verification complete.');
    } catch (migErr: any) {
      console.warn('[DB Migration] Notice during legacy record migration:', migErr.message);
    }
  }

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    this.isConnected = false;
  }
}

export const db = new DatabaseManager();
