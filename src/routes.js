import express from "express";
import { 
  fetchEmailsForAccount,
  markEmailAsRead,
  replyToEmail,
  deleteEmail,
  sendNewEmail,
  downloadEmailAttachment,    
} from "./emailService.js";

import multer from "multer";

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

const router = express.Router();

/**
 * GET /api/emails?email_account_id=UUID
 */
router.get("/", async (req, res) => {
  try {
    const {
      email_account_id,
      page = 1,
      limit = 20,
      search = "",
    } = req.query;

    if (!email_account_id) {
      return res.status(400).json({
        success: false,
        message: "email_account_id is required",
      });
    }

    const result = await fetchEmailsForAccount(
      email_account_id,
      Number(page),
      Number(limit),
      search
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });

  } catch (error) {
    console.error("Fetch emails error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch emails",
    });
  }
});

router.post("/read", async (req, res) => {
  const { email_account_id, mailbox, uid } = req.body;

  if (!email_account_id || !mailbox || !uid) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    const result = await markEmailAsRead(email_account_id, mailbox, uid);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reply', async (req, res) => {
  try {
    const result = await replyToEmail(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const { email_account_id, uid, mailbox } = req.body;

    if (!email_account_id || !uid) {
      return res.status(400).json({
        success: false,
        message: "email_account_id and uid are required",
      });
    }

    const result = await deleteEmail({
      email_account_id,
      uid,
      mailbox: mailbox || "INBOX",
    });

    res.json({
      success: true,
      message: "Email deleted successfully",
    });

  } catch (error) {
    console.error("Delete email error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete email",
    });
  }
});

/**
 * POST /api/emails/send
 * Send a new email (compose)
 */
router.post("/send", upload.array("attachments"), async (req, res) => {
  try {
    const {
      email_account_id,
      to_email,
      subject,
      body,
    } = req.body;

    const files = req.files;

    // 🔒 Validation
    if (!email_account_id || !to_email || !body) {
      return res.status(400).json({
        success: false,
        message: "email_account_id, to_email and body are required",
      });
    }

    const attachments = files?.map(file => ({
      filename: file.originalname,
      content: file.buffer,
    }));

    const result = await sendNewEmail({
      email_account_id,
      to: to_email,
      subject: subject || "",
      body,
      attachments,
    });

    res.json({
      success: true,
      message: "Email sent successfully",
      messageId: result.messageId,
    });

  } catch (error) {
    console.error("Send email error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to send email",
    });
  }
});


/**
 * GET /api/emails/attachment
 */
router.get("/attachment", async (req, res) => {
  try {
    const {
      email_account_id,
      mailbox = "INBOX",
      uid,
      part,
      filename,
      mimeType
    } = req.query;

    if (!email_account_id || !uid || !part) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    const buffer = await downloadEmailAttachment(
      email_account_id,
      mailbox,
      Number(uid),
      part
    );

    // ✅ sanitize mime type
    let contentType = "application/octet-stream";
    if (typeof mimeType === "string" && mimeType.includes("/")) {
      contentType = mimeType.split(";")[0].trim();
    }

    const isPdf = contentType === "application/pdf";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${isPdf ? "inline" : "attachment"}; filename="${filename || "file"}"`
    );
    res.setHeader("Cache-Control", "no-store");

    res.status(200).end(buffer);

  } catch (err) {
    console.error("Attachment error:", err);
    res.status(500).json({ message: err.message });
  }
});



export default router;
