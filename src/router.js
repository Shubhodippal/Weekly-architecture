import { handleRequestOtp } from "./handlers/auth/requestOtp.js";
import { handleVerifyOtp } from "./handlers/auth/verifyOtp.js";
import { handleLogout } from "./handlers/auth/logout.js";
import { handleMe } from "./handlers/user/me.js";
import { handleLeaderboard } from "./handlers/user/leaderboard.js";
import { handleListUsers } from "./handlers/admin/listUsers.js";
import { handleDeleteUser } from "./handlers/admin/deleteUser.js";
import { handleAdjustPoints } from "./handlers/admin/adjustPoints.js";
import { handleTriggerAutoChallenge } from "./handlers/admin/triggerAutoChallenge.js";
import { handlePostChallenge } from "./handlers/challenges/postChallenge.js";
import { handleListChallenges } from "./handlers/challenges/listChallenges.js";
import { handleDownloadChallenge } from "./handlers/challenges/downloadChallenge.js";
import { handleDeleteChallenge } from "./handlers/challenges/deleteChallenge.js";
import { handleEditChallenge } from "./handlers/challenges/editChallenge.js";
import { handleExpireChallenge } from "./handlers/challenges/expireChallenge.js";
import { handleDownloadAnswer } from "./handlers/challenges/downloadAnswer.js";
import { handleReopenChallenge } from "./handlers/challenges/reopenChallenge.js";
import { handleSubmit } from "./handlers/submissions/submit.js";
import { handleGetMySubmission } from "./handlers/submissions/getMySubmission.js";
import { handleDeleteMySubmission } from "./handlers/submissions/deleteMySubmission.js";
import { handleDownloadSubmissionFile } from "./handlers/submissions/downloadSubmissionFile.js";
import { handleListSubmissions } from "./handlers/submissions/listSubmissions.js";
import { handleGradeSubmission } from "./handlers/submissions/gradeSubmission.js";
import { handleListRewards } from "./handlers/rewards/listRewards.js";
import { handleClaimReward } from "./handlers/rewards/claimReward.js";
import { handlePassReward } from "./handlers/rewards/passReward.js";
import { handleAdminListRewardTiers } from "./handlers/rewards/adminListRewardTiers.js";
import { handleAdminUpdateRewardTier } from "./handlers/rewards/adminUpdateRewardTier.js";
import { handleAdminListClaims } from "./handlers/rewards/adminListClaims.js";
import { handleAdminFulfillClaim } from "./handlers/rewards/adminFulfillClaim.js";
import { handleAdminRejectClaim } from "./handlers/rewards/adminRejectClaim.js";
import { handleListComments } from "./handlers/comments/listComments.js";
import { handlePostComment } from "./handlers/comments/postComment.js";
import { handleDeleteComment } from "./handlers/comments/deleteComment.js";
import { handleUpdateComment } from "./handlers/comments/updateComment.js";
import { handleReactComment } from "./handlers/comments/reactComment.js";
import { handlePinComment } from "./handlers/comments/pinComment.js";
import { handleReportComment } from "./handlers/comments/reportComment.js";
import { handleHideComment } from "./handlers/comments/hideComment.js";
import { handleAdminListCommentReports } from "./handlers/comments/adminListReports.js";
import { handleAdminClearCommentReports } from "./handlers/comments/adminClearReports.js";
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

    if (method === "GET" && pathname === "/api/leaderboard")
      return handleLeaderboard(request, env);

    // Admin routes
    if (method === "GET" && pathname === "/api/admin/users")
      return handleListUsers(request, env);

    const deleteUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (method === "DELETE" && deleteUserMatch)
      return handleDeleteUser(request, env, deleteUserMatch[1]);

    const adjustPointsMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/points$/);
    if (method === "PATCH" && adjustPointsMatch)
      return handleAdjustPoints(request, env, adjustPointsMatch[1]);

    if (method === "POST" && pathname === "/api/admin/challenges/auto-post")
      return handleTriggerAutoChallenge(request, env);

    if (method === "GET" && pathname === "/api/admin/comments/reports")
      return handleAdminListCommentReports(request, env);

    // Challenge routes
    if (method === "POST" && pathname === "/api/challenges")
      return handlePostChallenge(request, env);

    if (method === "GET" && pathname === "/api/challenges")
      return handleListChallenges(request, env);

    const commentsForChallengeMatch = pathname.match(/^\/api\/challenges\/(\d+)\/comments$/);
    if (method === "GET" && commentsForChallengeMatch)
      return handleListComments(request, env, commentsForChallengeMatch[1]);
    if (method === "POST" && commentsForChallengeMatch)
      return handlePostComment(request, env, commentsForChallengeMatch[1]);

    const commentIdMatch = pathname.match(/^\/api\/comments\/(\d+)$/);
    if (method === "DELETE" && commentIdMatch)
      return handleDeleteComment(request, env, commentIdMatch[1]);
    if (method === "PATCH" && commentIdMatch)
      return handleUpdateComment(request, env, commentIdMatch[1]);

    const commentReactionMatch = pathname.match(/^\/api\/comments\/(\d+)\/reaction$/);
    if (method === "POST" && commentReactionMatch)
      return handleReactComment(request, env, commentReactionMatch[1]);

    const commentPinMatch = pathname.match(/^\/api\/comments\/(\d+)\/pin$/);
    if (method === "PATCH" && commentPinMatch)
      return handlePinComment(request, env, commentPinMatch[1]);

    const commentReportMatch = pathname.match(/^\/api\/comments\/(\d+)\/report$/);
    if (method === "POST" && commentReportMatch)
      return handleReportComment(request, env, commentReportMatch[1]);

    const commentHideMatch = pathname.match(/^\/api\/comments\/(\d+)\/hide$/);
    if (method === "PATCH" && commentHideMatch)
      return handleHideComment(request, env, commentHideMatch[1]);

    const adminClearReportsMatch = pathname.match(/^\/api\/admin\/comments\/(\d+)\/reports$/);
    if (method === "DELETE" && adminClearReportsMatch)
      return handleAdminClearCommentReports(request, env, adminClearReportsMatch[1]);

    const downloadMatch = pathname.match(/^\/api\/challenges\/(\d+)\/download$/);
    if (method === "GET" && downloadMatch)
      return handleDownloadChallenge(request, env, downloadMatch[1]);

    const answerMatch = pathname.match(/^\/api\/challenges\/(\d+)\/answer$/);
    if (method === "GET" && answerMatch)
      return handleDownloadAnswer(request, env, answerMatch[1]);

    const expireMatch = pathname.match(/^\/api\/challenges\/(\d+)\/expire$/);
    if (method === "POST" && expireMatch)
      return handleExpireChallenge(request, env, expireMatch[1]);

    const reopenMatch = pathname.match(/^\/api\/challenges\/(\d+)\/reopen$/);
    if (method === "POST" && reopenMatch)
      return handleReopenChallenge(request, env, reopenMatch[1]);

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

    const gradeSubmissionMatch = pathname.match(/^\/api\/submissions\/(\d+)\/grade$/);
    if (method === "PATCH" && gradeSubmissionMatch)
      return handleGradeSubmission(request, env, gradeSubmissionMatch[1]);

    // Reward routes (user)
    if (method === "GET"  && pathname === "/api/rewards")
      return handleListRewards(request, env);

    const rewardActionMatch = pathname.match(/^\/api\/rewards\/(\d+)\/(claim|pass)$/);
    if (method === "POST" && rewardActionMatch) {
      if (rewardActionMatch[2] === "claim") return handleClaimReward(request, env, rewardActionMatch[1]);
      if (rewardActionMatch[2] === "pass")  return handlePassReward(request, env, rewardActionMatch[1]);
    }

    // Reward routes (admin)
    if (method === "GET"  && pathname === "/api/admin/rewards/tiers")
      return handleAdminListRewardTiers(request, env);

    const adminTierMatch = pathname.match(/^\/api\/admin\/rewards\/tiers\/(\d+)$/);
    if (method === "PATCH" && adminTierMatch)
      return handleAdminUpdateRewardTier(request, env, adminTierMatch[1]);

    if (method === "GET"  && pathname === "/api/admin/rewards/claims")
      return handleAdminListClaims(request, env);

    const fulfillMatch = pathname.match(/^\/api\/admin\/rewards\/claims\/(\d+)\/fulfill$/);
    if (method === "PATCH" && fulfillMatch)
      return handleAdminFulfillClaim(request, env, fulfillMatch[1]);

    const rejectMatch = pathname.match(/^\/api\/admin\/rewards\/claims\/(\d+)\/reject$/);
    if (method === "PATCH" && rejectMatch)
      return handleAdminRejectClaim(request, env, rejectMatch[1]);

    return json({ success: false, message: "Not found" }, 404);
  } catch (err) {
    console.error("[router]", err);
    return json({ success: false, message: "Internal server error" }, 500);
  }
}
