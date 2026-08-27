import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILES_DB = path.join(DATA_DIR, "files.json");
const REPORTS_DB = path.join(DATA_DIR, "reports.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// In-memory presence roster: socketId -> { id, name }
const roster = new Map();

let sharedFiles = loadJson(FILES_DB);
let reports = loadJson(REPORTS_DB);

export function addStaff(socketId, name) {
  roster.set(socketId, { id: socketId, name });
}

export function removeStaff(socketId) {
  roster.delete(socketId);
}

export function getRoster() {
  return Array.from(roster.values());
}

export function findStaff(socketId) {
  return roster.get(socketId);
}

export function addFile(meta) {
  sharedFiles.push(meta);
  saveJson(FILES_DB, sharedFiles);
  return meta;
}

export function getFiles() {
  return sharedFiles;
}

export function addReport(report) {
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
