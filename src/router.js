import { handleRequestOtp } from "./handlers/auth/requestOtp.js";
import { handleVerifyOtp } from "./handlers/auth/verifyOtp.js";
import { handleLogout } from "./handlers/auth/logout.js";
import { handleMe } from "./handlers/user/me.js";
import { handleListUsers } from "./handlers/admin/listUsers.js";
import { handleDeleteUser } from "./handlers/admin/deleteUser.js";
import { handlePostChallenge } from "./handlers/challenges/postChallenge.js";
import { handleListChallenges } from "./handlers/challenges/listChallenges.js";
import { handleDownloadChallenge } from "./handlers/challenges/downloadChallenge.js";
import { handleDeleteChallenge } from "./handlers/challenges/deleteChallenge.js";
import { handleEditChallenge } from "./handlers/challenges/editChallenge.js";
import { handleSubmit } from "./handlers/submissions/submit.js";
import { handleGetMySubmission } from "./handlers/submissions/getMySubmission.js";
import { handleDeleteMySubmission } from "./handlers/submissions/deleteMySubmission.js";
import { handleDownloadSubmissionFile } from "./handlers/submissions/downloadSubmissionFile.js";
import { handleListSubmissions } from "./handlers/submissions/listSubmissions.js";
import { json } from "./utils/response.js";

export async function router(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  try {
    // Auth routes
    if (method === "POST" && pathname === "/api/auth/request-otp")
      return handleRequestOtp(request, env);

    if (method === "POST" && pathname === "/api/auth/verify-otp")
      return handleVerifyOtp(request, env);

    if (method === "POST" && pathname === "/api/auth/logout")
      return handleLogout(request, env);

    // User routes
    if (method === "GET" && pathname === "/api/user/me")
      return handleMe(request, env);

    // Admin routes
    if (method === "GET" && pathname === "/api/admin/users")
      return handleListUsers(request, env);

    const deleteUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (method === "DELETE" && deleteUserMatch)
      return handleDeleteUser(request, env, deleteUserMatch[1]);

    // Challenge routes
    if (method === "POST" && pathname === "/api/challenges")
      return handlePostChallenge(request, env);

    if (method === "GET" && pathname === "/api/challenges")
      return handleListChallenges(request, env);

    const downloadMatch = pathname.match(/^\/api\/challenges\/(\d+)\/download$/);
    if (method === "GET" && downloadMatch)
      return handleDownloadChallenge(request, env, downloadMatch[1]);

    const challengeIdMatch = pathname.match(/^\/api\/challenges\/(\d+)$/);
    if (method === "PATCH" && challengeIdMatch)
      return handleEditChallenge(request, env, challengeIdMatch[1]);
    if (method === "DELETE" && challengeIdMatch)
      return handleDeleteChallenge(request, env, challengeIdMatch[1]);

    // Submission routes
    const submitMatch = pathname.match(/^\/api\/challenges\/(\d+)\/submit$/);
    if (method === "POST" && submitMatch)
      return handleSubmit(request, env, submitMatch[1]);

    const mySubmissionMatch = pathname.match(/^\/api\/challenges\/(\d+)\/my-submission$/);
    if (method === "GET" && mySubmissionMatch)
      return handleGetMySubmission(request, env, mySubmissionMatch[1]);
    if (method === "DELETE" && mySubmissionMatch)
      return handleDeleteMySubmission(request, env, mySubmissionMatch[1]);

    const submissionFileMatch = pathname.match(/^\/api\/submissions\/(\d+)\/file$/);
    if (method === "GET" && submissionFileMatch)
      return handleDownloadSubmissionFile(request, env, submissionFileMatch[1]);

    const listSubmissionsMatch = pathname.match(/^\/api\/challenges\/(\d+)\/submissions$/);
    if (method === "GET" && listSubmissionsMatch)
      return handleListSubmissions(request, env, listSubmissionsMatch[1]);

    return json({ success: false, message: "Not found" }, 404);
  } catch (err) {
    console.error("[router]", err);
    return json({ success: false, message: "Internal server error" }, 500);
  }
}
