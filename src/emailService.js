import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getEmailAccount(email_account_id) {
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", email_account_id)
    .single();

  if (error || !data) {
    throw new Error("Email account not found");
  }

  return data;
}

function createImapClient(account) {
  return new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: {
      user: account.email,
      pass: account.password,
    },
  });
}

export async function fetchEmailsForAccount(email_account_id, page, limit) {
  const account = await getEmailAccount(email_account_id);
  const client = createImapClient(account);

  const emails = [];

  await client.connect();
  await client.mailboxOpen("INBOX");

  // 1️⃣ Get all message UIDs
  const uids = await client.search({ all: true });

  // 2️⃣ Sort newest → oldest
  uids.sort((a, b) => b - a);

  // 3️⃣ Pagination math
  const start = (page - 1) * limit;
  const end = start + limit;
  const pageUids = uids.slice(start, end);

  // 4️⃣ Fetch only paginated UIDs
  for await (const msg of client.fetch(pageUids, {
    uid: true,
    source: true,
    flags: true,
  })) {
    const parsed = await simpleParser(msg.source);

    const isRead =
      msg.flags instanceof Set
        ? msg.flags.has("\\Seen")
        : Array.isArray(msg.flags)
        ? msg.flags.includes("\\Seen")
        : false;

    emails.push({
      uid: msg.uid,
      mailbox: "inbox",
      from: parsed.from?.text || "",
      subject: parsed.subject || "",
      date: parsed.date,
      text: parsed.text || "",
      html: parsed.html || "",
      is_read: isRead,
      replies: [],
    });
  }

  await client.logout();

  // 🔹 Attach replies
  const replyMap = await fetchRepliesForAccount(email_account_id);
  for (const email of emails) {
    email.replies = replyMap[email.uid] || [];
  }

  return {
    data: emails,
    pagination: {
      page,
      limit,
      total: uids.length,
      hasMore: start + emails.length < uids.length,
    },
  };
}

export async function markEmailAsRead(email_account_id, mailbox, uid) {
  const account = await getEmailAccount(email_account_id);
  const client = createImapClient(account);

  await client.connect();
  await client.mailboxOpen(mailbox, { readOnly: false });

  await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });

  await client.logout();

  return { success: true };
}

function createSmtpClient(account) {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    auth: {
      user: account.email,
      pass: account.password,
    },
  });
}

export async function replyToEmail({
  email_account_id,
  message_uid,
  to_email,
  subject,
  body,
  inReplyTo,
  references
  }) {
    await sendEmail({
    email_account_id,
    to: to_email,
    subject,
    body,
    inReplyTo,
    references,
  });

    // 2️⃣ Save reply in DB
  const { error } = await supabase
    .from('email_replies')
    .insert({
      email_account_id,
      message_uid,
      to_email,
      subject,
      body
    });

  if (error) throw error;

  return { success: true };
}

export async function sendEmail({
  email_account_id,
  to,
  subject,
  body,
  inReplyTo,
  references,
}) {
  const account = await getEmailAccount(email_account_id);
  const transporter = createSmtpClient(account);

  const info = await transporter.sendMail({
    from: account.email,
    to,
    subject,
    text: body,
    headers: {
      ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
      ...(references ? { References: references } : {}),
    },
  });

  return {
    success: true,
    messageId: info.messageId,
  };
}

async function fetchRepliesForAccount(email_account_id) {
  const { data, error } = await supabase
    .from('email_replies')
    .select('*')
    .eq('email_account_id', email_account_id)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Group replies by message_uid
  const replyMap = {};

  for (const reply of data || []) {
    if (!replyMap[reply.message_uid]) {
      replyMap[reply.message_uid] = [];
    }
    replyMap[reply.message_uid].push(reply);
  }

  return replyMap;
}

export async function deleteEmail({
  email_account_id,
  mailbox = "INBOX",
  uid,
}) {
  const account = await getEmailAccount(email_account_id);
  if (!account) throw new Error("Email account not found");

  const client = createImapClient(account);

  await client.connect();
  await client.mailboxOpen(mailbox);

  // 1️⃣ Mark email as \Deleted
  await client.messageFlagsAdd(uid, ["\\Deleted"], { uid: true });

  // 2️⃣ Permanently remove it
  await client.messageDelete(Number(uid), { uid: true });

  await client.logout();

  return { success: true };
}