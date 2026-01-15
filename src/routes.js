import express from "express";
import { 
  fetchEmailsForAccount,
  markEmailAsRead,
  replyToEmail,
  deleteEmail
} from "./emailService.js";

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

export default router;
