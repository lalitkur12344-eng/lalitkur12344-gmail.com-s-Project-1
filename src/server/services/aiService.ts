import { GoogleGenAI } from '@google/genai';

export interface AIAnalysisResult {
  category: string;
  department: string;
  urgency: 'Low' | 'Medium' | 'High' | 'Emergency';
  severity: number;
  slaHours: number;
  summary: string;
  suggestedChecklist: string[];
  isEmergency: boolean;
  source: 'ai' | 'rule_fallback';
  quotaExceeded?: boolean;
}

export interface DuplicateDetectionResult {
  isDuplicateCandidate: boolean;
  confidenceScore: number; // 0 to 100
  matchedComplaintId?: string;
  reason?: string;
}

export const VALID_CATEGORIES = [
  'Water',
  'Electricity',
  'Hostel',
  'Mess & Food',
  'Cleanliness',
  'Maintenance',
  'Library',
  'Internet & Network',
  'Sanitation',
  'Other',
];

export const CATEGORY_DEPARTMENT_MAP: Record<string, string> = {
  Water: 'Maintenance',
  Electricity: 'Electricity',
  Hostel: 'Hostel',
  'Mess & Food': 'Hostel',
  Cleanliness: 'Sanitation',
  Maintenance: 'Maintenance',
  Library: 'Academic & Library',
  'Internet & Network': 'Internet & Network',
  Sanitation: 'Sanitation',
  Other: 'General Administration',
};

// Supported model whitelist per official @google/genai guidelines
export const SUPPORTED_MODELS = {
  GENERAL: 'gemini-3.8-flash',
  FAST: 'gemini-3.1-flash-lite',
  COMPLEX: 'gemini-4-argon',
};

// ==========================================
// Quota & Rate Limit Cooldown State Tracker
// ==========================================
let quotaExceededUntil = 0;
let lastQuotaMessage = '';

export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code;
  if (status === 429 || status === 'RESOURCE_EXHAUSTED') return true;

  const msg = String(err.message || err.details || err).toLowerCase();
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('billing')
  );
}

export function isTransientError(err: any): boolean {
  if (!err) return false;
  if (isQuotaError(err)) return false; // Never treat quota exhaustion as transient to prevent retry storming!

  const status = err.status || err.statusCode || err.code;
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 'UNAVAILABLE' ||
    status === 'DEADLINE_EXCEEDED'
  ) {
    return true;
  }

  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504')
  );
}

export function extractRetryDelay(err: any): number {
  if (!err) return 60;

  const retryHeader =
    err.response?.headers?.['retry-after'] ||
    err.headers?.['retry-after'] ||
    err.response?.headers?.get?.('retry-after');

  if (retryHeader) {
    const parsed = parseInt(String(retryHeader), 10);
    if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 300);
  }

  const msg = String(err.message || '');
  const match = msg.match(/retry\s+(?:after|in)\s+(\d+)\s*(?:s|sec|seconds)?/i);
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return Math.min(val, 300);
  }

  return 60; // 60 seconds default cooldown
}

export function recordQuotaError(err: any): void {
  const delaySecs = extractRetryDelay(err);
  quotaExceededUntil = Date.now() + delaySecs * 1000;
  lastQuotaMessage = `Gemini quota limits exceeded. Cooldown active for ${delaySecs}s.`;
  console.warn(`[AI Engine] ${lastQuotaMessage}`);
}

export function getQuotaStatus(): { isExceeded: boolean; retryInSeconds: number; message: string } {
  const now = Date.now();
  if (quotaExceededUntil > now) {
    const remainingSecs = Math.ceil((quotaExceededUntil - now) / 1000);
    return {
      isExceeded: true,
      retryInSeconds: remainingSecs,
      message: `Gemini quota limits exceeded. Quota resets in ~${remainingSecs}s. Non-AI campus care services remain 100% operational.`,
    };
  }
  return { isExceeded: false, retryInSeconds: 0, message: '' };
}

// Reset helper for testing
export function _resetQuotaStateForTesting(): void {
  quotaExceededUntil = 0;
  lastQuotaMessage = '';
}

// ==========================================
// Deterministic Rule-Based Fallback Engine
// ==========================================
export function ruleBasedComplaintAnalysis(title: string, description: string): AIAnalysisResult {
  const text = `${title} ${description}`.toLowerCase();

  let category = 'Maintenance';
  let urgency: 'Low' | 'Medium' | 'High' | 'Emergency' = 'Medium';
  let severity = 3;
  let slaHours = 24;

  if (
    text.includes('spark') ||
    text.includes('fire') ||
    text.includes('shock') ||
    text.includes('gas leak') ||
    text.includes('flood') ||
    text.includes('wire open') ||
    text.includes('short circuit')
  ) {
    urgency = 'Emergency';
    severity = 5;
    slaHours = 4;
  } else if (
    text.includes('urgent') ||
    text.includes('immediately') ||
    text.includes('overflow') ||
    text.includes('broken lock') ||
    text.includes('no water since morning')
  ) {
    urgency = 'High';
    severity = 4;
    slaHours = 8;
  } else if (
    text.includes('suggestion') ||
    text.includes('minor') ||
    text.includes('aesthetic') ||
    text.includes('paint')
  ) {
    urgency = 'Low';
    severity = 2;
    slaHours = 48;
  }

  // Category classification keywords
  if (
    text.includes('electric') ||
    text.includes('light') ||
    text.includes('fan') ||
    text.includes('switch') ||
    text.includes('socket') ||
    text.includes('power cut') ||
    text.includes('generator') ||
    text.includes('ac ') ||
    text.includes('mcb')
  ) {
    category = 'Electricity';
    slaHours = urgency === 'Emergency' ? 4 : urgency === 'High' ? 8 : 16;
  } else if (
    text.includes('water') ||
    text.includes('tap') ||
    text.includes('pipe') ||
    text.includes('leak') ||
    text.includes('geyser') ||
    text.includes('ro plant') ||
    text.includes('cooler') ||
    text.includes('flush')
  ) {
    category = 'Water';
    slaHours = urgency === 'Emergency' ? 4 : urgency === 'High' ? 8 : 18;
  } else if (
    text.includes('wifi') ||
    text.includes('wi-fi') ||
    text.includes('internet') ||
    text.includes('lan') ||
    text.includes('network') ||
    text.includes('router') ||
    text.includes('port') ||
    text.includes('bandwidth')
  ) {
    category = 'Internet & Network';
    slaHours = urgency === 'High' ? 8 : 24;
  } else if (
    text.includes('food') ||
    text.includes('mess') ||
    text.includes('meal') ||
    text.includes('canteen') ||
    text.includes('quality') ||
    text.includes('cook') ||
    text.includes('roti') ||
    text.includes('insects in food')
  ) {
    category = 'Mess & Food';
    if (text.includes('insects') || text.includes('poison') || text.includes('stale')) {
      urgency = 'Emergency';
      severity = 5;
      slaHours = 4;
    }
  } else if (
    text.includes('clean') ||
    text.includes('garbage') ||
    text.includes('trash') ||
    text.includes('dustbin') ||
    text.includes('toilet') ||
    text.includes('washroom') ||
    text.includes('drain')
  ) {
    category = text.includes('toilet') || text.includes('washroom') || text.includes('drain') ? 'Sanitation' : 'Cleanliness';
    slaHours = 12;
  } else if (
    text.includes('hostel') ||
    text.includes('bed') ||
    text.includes('almirah') ||
    text.includes('warden') ||
    text.includes('curfew') ||
    text.includes('room key')
  ) {
    category = 'Hostel';
  } else if (text.includes('library') || text.includes('book') || text.includes('reading room') || text.includes('journal')) {
    category = 'Library';
  }

  const department = CATEGORY_DEPARTMENT_MAP[category] || 'General Administration';

  const defaultChecklists: Record<string, string[]> = {
    Electricity: [
      'Isolate electric circuit breaker before inspection',
      'Inspect wiring, switchboard socket, or fixture',
      'Replace damaged fuse/MCB or components',
      'Conduct voltage and safety continuity test',
    ],
    Water: [
      'Shut off local gate valve to control water wastage',
      'Inspect pipe joints, tap washer, or tank inlet',
      'Install replacement washer/plumbing hardware',
      'Verify water pressure and seal tightness',
    ],
    'Internet & Network': [
      'Check PoE switch port and wireless access point status',
      'Verify student/faculty MAC binding and IP assignment',
      'Test packet loss and gateway latency',
      'Reboot access point or re-terminate RJ45 jack',
    ],
    'Mess & Food': [
      'Contact Mess Secretary and Hostel Warden immediately',
      'Inspect kitchen hygiene, storage, and food batch',
      'Collect sample for food committee verification',
      'Direct mess contractor to remediate issue',
    ],
    Sanitation: [
      'Dispatch cleaning staff with sanitation kit',
      'Clear clog or sanitize affected washroom/area',
      'Disinfect floor with hospital-grade cleaner',
      'Verify water replenishment and odor control',
    ],
    Cleanliness: [
      'Deploy housekeeping team to specified floor/area',
      'Empty bins and dispose waste at college disposal bay',
      'Mop floor and verify hygiene standards',
    ],
    Hostel: [
      'Notify Hostel Caretaker and Warden',
      'Inspect room furniture/infrastructure',
      'Schedule repair with resident carpenter/welder',
      'Obtain student acknowledgment signature upon completion',
    ],
  };

  const checklist = defaultChecklists[category] || [
    'Inspect the reported site on campus',
    'Assess required tools, parts, and safety precautions',
    'Execute resolution work',
    'Verify operational condition and close ticket',
  ];

  return {
    category,
    department,
    urgency,
    severity,
    slaHours,
    summary: description.length > 80 ? description.substring(0, 80) + '...' : description,
    suggestedChecklist: checklist,
    isEmergency: urgency === 'Emergency',
    source: 'rule_fallback',
  };
}

// ==========================================
// Complaint Triage With Safe Quota Handling
// ==========================================
export async function analyzeComplaintWithAI(title: string, description: string): Promise<AIAnalysisResult> {
  // 1. Check if Gemini quota is currently cooling down
  const quota = getQuotaStatus();
  if (quota.isExceeded) {
    const fallback = ruleBasedComplaintAnalysis(title, description);
    return {
      ...fallback,
      quotaExceeded: true,
      summary: `${fallback.summary} (Categorized via rule engine due to AI rate limit)`,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return ruleBasedComplaintAnalysis(title, description);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `You are the AI triage engine for Campus Care at Rajkiya Engineering College, Bijnor (REC Bijnor).
Analyze this campus complaint:
Title: "${title}"
Description: "${description}"

Allowed Categories: ["Water", "Electricity", "Hostel", "Mess & Food", "Cleanliness", "Maintenance", "Library", "Internet & Network", "Sanitation", "Other"]
Allowed Urgencies: ["Low", "Medium", "High", "Emergency"]

Return ONLY a valid JSON object with these keys (no markdown formatting, no code block backticks):
{
  "category": "one of allowed categories",
  "urgency": "one of allowed urgencies",
  "severity": number between 1 and 5,
  "slaHours": estimated hours needed (4 for emergency, 8-12 for high, 24 for medium, 48 for low),
  "summary": "one clear sentence summarizing the issue for administration",
  "suggestedChecklist": ["action step 1", "action step 2", "action step 3"]
}`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI inference timeout (4000ms exceeded)')), 4000)
    );

    const generatePromise = ai.models.generateContent({
      model: SUPPORTED_MODELS.GENERAL,
      contents: prompt,
      config: {
        temperature: 0.1,
      },
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const text = response.text?.trim() || '';
    const cleanJson = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanJson);

    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Maintenance';
    const urgency = ['Low', 'Medium', 'High', 'Emergency'].includes(parsed.urgency) ? parsed.urgency : 'Medium';
    const severity = Math.min(Math.max(Number(parsed.severity) || 3, 1), 5);
    const slaHours = Number(parsed.slaHours) || (urgency === 'Emergency' ? 4 : urgency === 'High' ? 12 : 24);
    const department = CATEGORY_DEPARTMENT_MAP[category] || 'General Administration';

    return {
      category,
      department,
      urgency: urgency as any,
      severity,
      slaHours,
      summary: parsed.summary || title,
      suggestedChecklist:
        Array.isArray(parsed.suggestedChecklist) && parsed.suggestedChecklist.length > 0
          ? parsed.suggestedChecklist.slice(0, 5)
          : ruleBasedComplaintAnalysis(title, description).suggestedChecklist,
      isEmergency: urgency === 'Emergency',
      source: 'ai',
    };
  } catch (err: any) {
    if (isQuotaError(err)) {
      recordQuotaError(err);
      const fallback = ruleBasedComplaintAnalysis(title, description);
      return {
        ...fallback,
        quotaExceeded: true,
      };
    }

    console.warn('[AI Triage] Non-critical AI inference exception, using rule fallback:', err.message);
    return ruleBasedComplaintAnalysis(title, description);
  }
}

// ==========================================
// Duplicate Detection
// ==========================================
export function detectDuplicateComplaint(
  newTitle: string,
  newDescription: string,
  newCategory: string,
  newLocation: { area: string; block?: string; room?: string },
  existingOpenComplaints: any[]
): DuplicateDetectionResult {
  if (!existingOpenComplaints || existingOpenComplaints.length === 0) {
    return { isDuplicateCandidate: false, confidenceScore: 0 };
  }

  const cleanWords = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const newWords = new Set([...cleanWords(newTitle), ...cleanWords(newDescription)]);

  let highestScore = 0;
  let matchedComplaint: any = null;
  let matchReason = '';

  for (const complaint of existingOpenComplaints) {
    let score = 0;
    const reasons: string[] = [];

    if (complaint.category === newCategory) {
      score += 25;
      reasons.push('Same category');
    }

    if (complaint.location?.area === newLocation.area) {
      score += 25;
      reasons.push('Same campus area');
      if (
        complaint.location?.block &&
        newLocation.block &&
        complaint.location.block.toLowerCase() === newLocation.block.toLowerCase()
      ) {
        score += 15;
        reasons.push('Same block');
      }
      if (
        complaint.location?.room &&
        newLocation.room &&
        complaint.location.room.toLowerCase() === newLocation.room.toLowerCase()
      ) {
        score += 20;
        reasons.push('Exact same room');
      }
    }

    const existingWords = new Set([
      ...cleanWords(complaint.title || ''),
      ...cleanWords(complaint.description || ''),
    ]);

    let intersectionCount = 0;
    for (const w of newWords) {
      if (existingWords.has(w)) intersectionCount++;
    }
    const unionCount = new Set([...newWords, ...existingWords]).size;
    const wordSimilarity = unionCount > 0 ? (intersectionCount / unionCount) * 100 : 0;

    if (wordSimilarity > 35) {
      score += Math.min(wordSimilarity * 0.4, 30);
      reasons.push(`High textual similarity (${Math.round(wordSimilarity)}%)`);
    }

    if (score > highestScore) {
      highestScore = score;
      matchedComplaint = complaint;
      matchReason = reasons.join(', ');
    }
  }

  if (highestScore >= 60 && matchedComplaint) {
    return {
      isDuplicateCandidate: true,
      confidenceScore: Math.min(Math.round(highestScore), 98),
      matchedComplaintId: matchedComplaint.complaintId,
      reason: `Potential duplicate of open ticket #${matchedComplaint.complaintId}: ${matchReason}`,
    };
  }

  return {
    isDuplicateCandidate: false,
    confidenceScore: Math.round(highestScore),
  };
}

// ==========================================
// Multi-turn Chatbot with Graceful Quota Handling
// ==========================================
export interface ChatMessage {
  role: 'user' | 'model' | 'assistant';
  text: string;
}

export type ChatbotRole = 'advisor' | 'technical' | 'emergency';

const ROLE_SYSTEM_INSTRUCTIONS: Record<ChatbotRole, string> = {
  advisor: `You are the official Campus Care AI Advisor for Rajkiya Engineering College, Bijnor (REC Bijnor), UP, India.
Your role:
- Assist students, faculty, and campus residents with reporting issues, filing complaints, and tracking maintenance work.
- Help categorize issues into: Water, Electricity, Hostel, Mess & Food, Cleanliness, Maintenance, Library, Internet & Network, Sanitation.
- Explain campus policies, hostel amenities (Ramanujan Boys Hostel 1, Aryabhatta Boys Hostel 2, Kalpana Chawla Girls Hostel), dining hall timings, and electricity/generator schedules.
- Always be courteous, constructive, and concise. Format points with clear bullet points.`,

  technical: `You are the Senior Maintenance & Engineering Diagnostics Specialist for Rajkiya Engineering College, Bijnor (REC Bijnor).
Your role:
- Assist campus technicians (Electricians, Plumbers, Network Engineers, Workshop staff) with deep technical diagnostics.
- Provide step-by-step Standard Operating Procedures (SOPs), electrical safety rules (lockout-tagout, circuit breaker troubleshooting, capacitor testing), Wi-Fi/LAN troubleshooting (PoE, Cisco AP, DHCP leasing), and plumbing leakage mitigation.
- Offer actionable advice, required tools, and safety precautions.`,

  emergency: `You are the Rapid Campus Dispatch & Emergency Helpline Assistant for REC Bijnor.
Your role:
- Provide fast, immediate, safety-first responses for urgent campus situations.
- Key Campus Emergency Contacts:
  * Substation / Electrical Breakdown: +91 98370 11223
  * Chief Hostel Warden: +91 94120 12345
  * Campus Network & Server Center: +91 98370 77889
  * Estate Maintenance Office: 01342-241001
  * Emergency Medical / Ambulance: 108 / 112
- Instruct users to isolate hazards, notify local hostel care-takers, and stay safe. Keep answers short and direct.`,
};

export async function chatWithGemini(
  messages: ChatMessage[],
  roleMode: ChatbotRole = 'advisor',
  requestedModel?: string
): Promise<{ reply: string; modelUsed: string; roleMode: ChatbotRole; quotaExceeded?: boolean }> {
  const latestUserQuery = messages[messages.length - 1]?.text || '';

  // 1. Check if Gemini quota is currently cooling down
  const quota = getQuotaStatus();
  if (quota.isExceeded) {
    return {
      reply: `⚠️ **AI Quota Notice:** The Gemini API rate limit or usage quota has been temporarily reached.\n\n` +
        `⏳ Cooldown active: Resets in approximately **${quota.retryInSeconds} seconds**.\n\n` +
        `✅ **All core features remain active:** You can submit complaints, track tickets, view announcements, and contact support.\n\n` +
        `📞 **Campus Emergency Contacts:** Substation (+91 98370 11223) | Estate Office (01342-241001) | Chief Warden (+91 94120 12345)\n\n` +
        `---\n\n` +
        getFallbackChatResponse(latestUserQuery, roleMode),
      modelUsed: 'quota_cooldown_active',
      roleMode,
      quotaExceeded: true,
    };
  }

  // Determine model: validate against supported models
  let model = requestedModel;
  if (!model || model === 'auto') {
    if (roleMode === 'emergency') {
      model = SUPPORTED_MODELS.FAST;
    } else if (roleMode === 'technical') {
      model = SUPPORTED_MODELS.GENERAL;
    } else {
      model = SUPPORTED_MODELS.GENERAL;
    }
  }

  // Validate model whitelist
  const allowed = [SUPPORTED_MODELS.GENERAL, SUPPORTED_MODELS.FAST, SUPPORTED_MODELS.COMPLEX];
  if (!allowed.includes(model)) {
    model = SUPPORTED_MODELS.GENERAL;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      reply: getFallbackChatResponse(latestUserQuery, roleMode),
      modelUsed: 'rule_fallback_no_api_key',
      roleMode,
    };
  }

  const systemInstruction = ROLE_SYSTEM_INSTRUCTIONS[roleMode] || ROLE_SYSTEM_INSTRUCTIONS.advisor;

  // Format history for @google/genai SDK
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Execute request with timeout
  const timeoutMs = 5000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Chat inference timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    const callPromise = ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: roleMode === 'technical' ? 0.2 : 0.7,
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const reply = response.text?.trim() || 'I have reviewed your query. How else may I assist with REC Bijnor campus care?';

    return {
      reply,
      modelUsed: model,
      roleMode,
      quotaExceeded: false,
    };
  } catch (err: any) {
    // 1. Quota Error Handling (429 / RESOURCE_EXHAUSTED)
    if (isQuotaError(err)) {
      recordQuotaError(err);
      return {
        reply: `⚠️ **AI Quota Limit Exceeded:** The Gemini API quota has been reached.\n\n` +
          `AI responses are temporarily paused for ~${extractRetryDelay(err)}s. In the meantime, non-AI features (complaint submission, tracking, admin) are fully operational.\n\n` +
          `📞 **Campus Emergency Contacts:** Substation (+91 98370 11223) | Estate Office (01342-241001) | Chief Warden (+91 94120 12345)\n\n` +
          `---\n\n` +
          getFallbackChatResponse(latestUserQuery, roleMode),
        modelUsed: 'quota_fallback',
        roleMode,
        quotaExceeded: true,
      };
    }

    // 2. Transient Error Handling (502, 503, 504, timeout) -> Controlled retry ONCE with fast model
    if (isTransientError(err) && model !== SUPPORTED_MODELS.FAST) {
      console.warn(`[AI Chat] Transient error on ${model} (${err.message}). Retrying once with ${SUPPORTED_MODELS.FAST}...`);
      try {
        const fallbackCall = ai.models.generateContent({
          model: SUPPORTED_MODELS.FAST,
          contents,
          config: {
            systemInstruction,
            temperature: 0.4,
          },
        });
        const retryRes = await Promise.race([fallbackCall, timeoutPromise]);
        if (retryRes.text) {
          return {
            reply: retryRes.text.trim(),
            modelUsed: `${SUPPORTED_MODELS.FAST}_fallback`,
            roleMode,
            quotaExceeded: false,
          };
        }
      } catch (retryErr: any) {
        if (isQuotaError(retryErr)) {
          recordQuotaError(retryErr);
          return {
            reply: `⚠️ **AI Quota Limit Exceeded:** The Gemini API quota has been reached.\n\n` +
              getFallbackChatResponse(latestUserQuery, roleMode),
            modelUsed: 'quota_fallback',
            roleMode,
            quotaExceeded: true,
          };
        }
        console.warn('[AI Chat] Controlled fallback also failed:', retryErr.message);
      }
    }

    // 3. Graceful deterministic fallback
    return {
      reply: getFallbackChatResponse(latestUserQuery, roleMode),
      modelUsed: 'deterministic_fallback',
      roleMode,
      quotaExceeded: false,
    };
  }
}

export function getFallbackChatResponse(userQuery: string, roleMode: ChatbotRole): string {
  const q = userQuery.toLowerCase();
  if (
    roleMode === 'emergency' ||
    q.includes('emergency') ||
    q.includes('fire') ||
    q.includes('shock') ||
    q.includes('spark')
  ) {
    return `🚨 **Emergency Protocols for REC Bijnor:**\n1. **Electrical / Fire Hazard:** Immediately evacuate the room and inform hostel security. Contact Junior Engineer Electrical: **+91 98370 11223** or Substation.\n2. **Medical Emergency:** Contact Campus Dispensary or Dial **108 / 112**.\n3. **Estate & Campus Security Office:** Phone **01342-241001**.\nPlease also register an **Emergency Priority Complaint** in the portal for automatic Deanery notification.`;
  }

  if (q.includes('wifi') || q.includes('wi-fi') || q.includes('internet') || q.includes('lan')) {
    return `📶 **REC Bijnor Campus Wi-Fi & Network Guide:**\n- Wi-Fi networks broadcasted: **REC-CAMPUS-WIFI** and **REC-STUDENT-NET**.\n- If offline in your block, check if the corridor PoE Access Point LED is solid green. If amber/red, log a complaint under the **Internet & Network** category.\n- Computer Center Administrator: **Dr. Amit Verma** (contact: computercenter@recb.ac.in).`;
  }

  if (q.includes('water') || q.includes('leak') || q.includes('cooler')) {
    return `💧 **Water & Plumbing Services:**\n- Drinking water coolers are installed on each hostel floor and academic wings.\n- If a cooler is warm or a pipe is leaking, file a ticket under **Water** category with your exact hostel and floor number.\n- High priority tickets carry an 8-hour resolution SLA.`;
  }

  return `Hello! I am the REC Bijnor Campus Care Assistant.\nYou can ask me about:\n- How to report complaints (Electricity, Water, Wi-Fi, Mess, Sanitation)\n- SLA resolution deadlines and auto-escalation rules\n- Campus building and hostel locations (Ramanujan BH-1, Aryabhatta BH-2, Kalpana Chawla GH)\n- Emergency helpline contacts.\nHow can I assist you right now?`;
}
