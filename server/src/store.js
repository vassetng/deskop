import fs from "fs";
import path from "path";
import crypto from "crypto";
import { serverPath } from "./paths.js";

const DATA_DIR = serverPath("data");
const FILES_DB = path.join(DATA_DIR, "files.json");
const REPORTS_DB = path.join(DATA_DIR, "reports.json");
const STAFF_DB = path.join(DATA_DIR, "staff.json");
const DEPARTMENTS_DB = path.join(DATA_DIR, "departments.json");
const MESSAGES_DB = path.join(DATA_DIR, "messages.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Online presence (ephemeral, keyed by socket id) ---
const presence = new Map();

export function addPresence(socketId, staffId, displayName) {
  presence.set(socketId, { socketId, staffId, name: displayName });
}

export function removePresence(socketId) {
  presence.delete(socketId);
}

export function getPresenceRoster() {
  return Array.from(presence.values()).map((p) => ({ id: p.socketId, name: p.name, staffId: p.staffId }));
}

export function findPresence(socketId) {
  return presence.get(socketId);
}

export function isStaffOnline(staffId) {
  return Array.from(presence.values()).some((p) => p.staffId === staffId);
}

export function socketIdsForStaff(staffId) {
  return Array.from(presence.values())
    .filter((p) => p.staffId === staffId)
    .map((p) => p.socketId);
}

// --- Files ---
let sharedFiles = loadJson(FILES_DB, []);

export function addFile(meta) {
  sharedFiles.push(meta);
  saveJson(FILES_DB, sharedFiles);
  return meta;
}

export function getFiles() {
  return sharedFiles;
}

// --- Reports ---
let reports = loadJson(REPORTS_DB, []);

// Resubmitting the same day replaces that day's report in place (same id,
// fresh submittedAt, status reset to "new" so admins see it needs
// re-review) instead of stacking duplicates — one report per staff per day.
export function addReport(report) {
  const idx = reports.findIndex((r) => r.authorId === report.authorId && r.date === report.date);
  if (idx !== -1) {
    reports[idx] = { ...report, id: reports[idx].id };
    saveJson(REPORTS_DB, reports);
    return reports[idx];
  }
  reports.push(report);
  saveJson(REPORTS_DB, reports);
  return report;
}

export function getReports() {
  return reports;
}

export function getReportsByDate(date) {
  return reports.filter((r) => r.date === date);
}

export function setReportStatus(id, status) {
  const report = reports.find((r) => r.id === id);
  if (!report) return null;
  report.status = status;
  saveJson(REPORTS_DB, reports);
  return report;
}

// --- Departments ---
let departments = loadJson(DEPARTMENTS_DB, null);
if (!departments) {
  departments = ["HR", "Accounts", "Operations", "Admin"];
  saveJson(DEPARTMENTS_DB, departments);
}

export function getDepartments() {
  return departments;
}

export function addDepartment(name) {
  if (!departments.includes(name)) {
    departments.push(name);
    saveJson(DEPARTMENTS_DB, departments);
  }
  return departments;
}

export function removeDepartment(name) {
  departments = departments.filter((d) => d !== name);
  saveJson(DEPARTMENTS_DB, departments);
  return departments;
}

// --- Staff accounts ---
let staff = loadJson(STAFF_DB, []);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

export function ensureBootstrapAdmin() {
  if (staff.length > 0) return null;
  const { salt, hash } = hashPassword("admin123");
  const admin = {
    id: crypto.randomUUID(),
    username: "admin",
    passwordSalt: salt,
    passwordHash: hash,
    displayName: "Admin",
    department: "Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
  };
  staff.push(admin);
  saveJson(STAFF_DB, staff);
  return { username: "admin", password: "admin123" };
}

export function createStaff({ username, password, displayName, department, role }) {
  const { salt, hash } = hashPassword(password);
  const record = {
    id: crypto.randomUUID(),
    username,
    passwordSalt: salt,
    passwordHash: hash,
    displayName,
    department,
    role: role === "admin" ? "admin" : "staff",
    createdAt: new Date().toISOString(),
  };
  staff.push(record);
  saveJson(STAFF_DB, staff);
  return record;
}

export function findStaffByUsername(username) {
  return staff.find((s) => s.username.toLowerCase() === String(username).toLowerCase());
}

export function findStaffById(id) {
  return staff.find((s) => s.id === id);
}

export function getAllStaff() {
  return staff;
}

export function updateStaff(id, updates) {
  const record = staff.find((s) => s.id === id);
  if (!record) return null;
  Object.assign(record, updates);
  saveJson(STAFF_DB, staff);
  return record;
}

export function deleteStaff(id) {
  staff = staff.filter((s) => s.id !== id);
  saveJson(STAFF_DB, staff);
}

export function publicStaff(record) {
  const { passwordHash, passwordSalt, ...rest } = record;
  return rest;
}

// --- Sessions (in-memory bearer tokens) ---
const sessions = new Map(); // token -> staffId

export function createSession(staffId) {
  const token = crypto.randomUUID();
  sessions.set(token, staffId);
  return token;
}

export function resolveSession(token) {
  const staffId = sessions.get(token);
  if (!staffId) return null;
  return findStaffById(staffId) || null;
}

export function destroySession(token) {
  sessions.delete(token);
}

// --- Messages (DMs + department channels) ---
let messages = loadJson(MESSAGES_DB, []);

export function dmKey(idA, idB) {
  return [idA, idB].sort().join(":");
}

export function addMessage(msg) {
  messages.push(msg);
  saveJson(MESSAGES_DB, messages);
  return msg;
}

export function getChannelMessages(department) {
  return messages.filter((m) => m.kind === "channel" && m.target === department);
}

export function getDmMessages(idA, idB) {
  const key = dmKey(idA, idB);
  return messages.filter((m) => m.kind === "dm" && m.target === key);
}

export function findMessageByAttachment(storedName) {
  return messages.find((m) => m.attachment?.storedName === storedName);
}

// --- Activity log (in-memory ring buffer for the admin dashboard) ---
const ACTIVITY_LIMIT = 200;
const activity = [];

export function logActivity(type, detail) {
  activity.push({ id: crypto.randomUUID(), type, detail, at: new Date().toISOString() });
  if (activity.length > ACTIVITY_LIMIT) activity.shift();
}

export function getActivity() {
  return activity.slice().reverse();
}
