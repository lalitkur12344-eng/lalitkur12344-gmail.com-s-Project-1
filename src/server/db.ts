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

export interface DatabaseAdapter {
  isConnected: boolean;
  connectionError: string | null;
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

  async init(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    this.mongoUriConfigured = Boolean(mongoUri);

    if (!mongoUri) {
      this.isConnected = false;
      this.connectionError = 'MONGODB_URI environment variable is not defined.';
      console.warn('[DB] MONGODB_URI not configured. MongoDB persistence is unavailable until MONGODB_URI is provided.');
      return;
    }

    try {
      console.log('[DB] Connecting to MongoDB via Mongoose...');
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });

      this.isConnected = true;
      this.connectionError = null;
      console.log('[DB] Connected to MongoDB successfully. Mongoose models active.');

      // Safely preserve and migrate any records from existing json storage if MongoDB is empty
      await this.migrateLegacyDataIfEmpty();
    } catch (err: any) {
      this.isConnected = false;
      this.connectionError = err.message || String(err);
      console.error(`[DB] MongoDB connection failure: ${this.connectionError}`);
      console.error('[DB] Note: In accordance with system requirements, silent fallback to in-memory/file storage is disabled.');
    }
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
}

export const db = new DatabaseManager();
