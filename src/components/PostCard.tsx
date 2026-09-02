import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Sparkles, RefreshCw, Wand2, Tag, Clock, Edit3, MessageSquareText, Trash2, MessageCircle, ShieldCheck } from "lucide-react";
import { Post, PostStatus } from "../types";
import { postsApi } from "../lib/api";
import type { Role } from "../lib/api";
import { analyzeSmsSegments } from "../lib/smsSegments";
import { ConfirmDialog } from "./ConfirmDialog";

interface PostCardProps {
  post: Post;
  brandColor?: string;
  onUpdatePost: (updated: Post) => void;
  onRefinePostWithAI: (post: Post, instruction: string) => Promise<Post>;
  onDeletePost?: (postId: string) => void;
  currentUserRole?: Role;
}

const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  scheduled: "Scheduled",
};

export const PostCard: React.FC<PostCardProps> = ({
  post,
  brandColor = "#6366f1",
  onUpdatePost,
  onRefinePostWithAI,
  onDeletePost,
  currentUserRole,
}) => {
  const queryClient = useQueryClient();
  const [copiedHook, setCopiedHook] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [pendingRefine, setPendingRefine] = useState<Post | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editCaption, setEditCaption] = useState(post.caption);
  const [editHook, setEditHook] = useState(post.hook);

  const isViewer = currentUserRole === "viewer";
  const isAdmin = currentUserRole === "admin";
  const canWrite = !isViewer;

  const commentsQuery = useQuery({
    queryKey: ["comments", post.id],
    queryFn: () => postsApi.listComments(post.id),
    enabled: showComments,
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => postsApi.addComment(post.id, body),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["comments", post.id] });
    },
  });

  const handleCopyHook = () => {
    navigator.clipboard.writeText(post.hook);
    setCopiedHook(true);
    setTimeout(() => setCopiedHook(false), 2000);
  };

  const handleCopyCaption = () => {
    // SMS: the caption IS the entire message (promo code & CTA already baked in) — copy it alone.
    const isSmsPost = post.platform.toLowerCase().includes("sms");
    const fullText = isSmsPost
      ? post.caption
      : `${post.hook}\n\n${post.caption}\n\nUse Code: ${post.promoCodeUsed}\n\n${post.cta}\n\n${(post.hashtags || []).join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleAiRefine = async (instruction: string) => {
    setIsRefining(true);
    setRefineError(null);
    try {
      const refined = await onRefinePostWithAI(post, instruction);
      setPendingRefine(refined);
      setShowAiMenu(false);
    } catch (err: any) {
      setRefineError(err.message || "Could not refine post with AI. Please try again.");
    } finally {
      setIsRefining(false);
      setCustomAiPrompt("");
    }
  };

  const handleApplyRefine = () => {
    if (pendingRefine) {
      onUpdatePost(pendingRefine);
      setPendingRefine(null);
    }
  };

  const handleDiscardRefine = () => {
    setPendingRefine(null);
  };

  const handleSaveEdits = () => {
    const isSmsPost = post.platform.toLowerCase().includes("sms");
    onUpdatePost({
      ...post,
      // SMS has no separate hook — the caption is the entire message.
      hook: isSmsPost ? editCaption : editHook,
      caption: editCaption,
    });
    setIsEditing(false);
  };

  const handleStatusChange = (newStatus: PostStatus) => {
    onUpdatePost({ ...post, status: newStatus });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment.trim());
  };

  const isSms = post.platform.toLowerCase().includes("sms");
  const isWebPush = post.platform.toLowerCase().includes("push");
  const smsInfo = analyzeSmsSegments(post.caption || "");
  const isSmsOverLimit = isSms && smsInfo.isMultiSegment;
  const comments = commentsQuery.data || [];

  return (
    <div
      id={`post-card-${post.id}`}
      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-xs transition-all space-y-3 flex flex-col justify-between relative group text-slate-100"
    >
      {/* Top Bar: Slot, Brand & Platform Badge */}
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-slate-950 font-mono shadow-xs"
              style={{ backgroundColor: brandColor }}
            >
              {post.scheduledDate ? post.scheduledDate : `Day ${post.dayNumber}`} • Slot {post.slotIndex}
            </span>
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" />
              {post.timeSlot}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Dropdown (read-only badge for viewers) */}
            {canWrite ? (
              <select
                value={post.status}
                onChange={(e) => handleStatusChange(e.target.value as PostStatus)}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border focus:outline-none cursor-pointer ${
                  post.status === "approved"
                    ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                    : post.status === "pending_review"
                    ? "bg-amber-950/50 text-amber-300 border-amber-800/60"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="approved" disabled={!isAdmin}>
                  {isAdmin ? "Approved" : "Approved (admin only)"}
                </option>
              </select>
            ) : (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  post.status === "approved"
                    ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                    : post.status === "pending_review"
                    ? "bg-amber-950/50 text-amber-300 border-amber-800/60"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {STATUS_LABELS[post.status]}
              </span>
            )}

            {/* Delete Post Button */}
            {canWrite && onDeletePost && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {post.status === "approved" && post.approvedBy && (
          <div className="pt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <ShieldCheck className="w-3 h-3" />
            <span>
              Approved by {post.approvedBy}
              {post.approvedAt ? ` on ${new Date(post.approvedAt).toLocaleDateString()}` : ""}
            </span>
          </div>
        )}

        {/* Brand & Platform Badges */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brandColor }} />
            {post.brandName}
          </span>

          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
              isSms ? "bg-amber-950/40 text-amber-300 border-amber-800/60" : "bg-purple-950/40 text-purple-300 border-purple-800/60"
            }`}>
              {post.platform}
            </span>
            <span className="text-[10px] font-medium bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
              {post.format}
            </span>
          </div>
        </div>

        {/* SMS 160 Char Limit Badge or Web Push Emoji Badge */}
        <div className="pt-2 flex items-center justify-between">
          {isSms && (
            <div
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                isSmsOverLimit
                  ? "bg-rose-950/50 text-rose-300 border-rose-800/60 animate-pulse"
                  : "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
              }`}
              title={
                smsInfo.encoding === "UCS-2"
                  ? "Contains a character outside the GSM-7 alphabet (emoji, em dash, curly quotes, etc.) — this forces Unicode encoding, cutting the per-segment limit from 160 to 70."
                  : undefined
              }
            >
              <MessageSquareText className="w-3 h-3" />
              <span>
                {smsInfo.effectiveLength}/{smsInfo.singleSegmentLimit} {smsInfo.encoding}
                {smsInfo.isMultiSegment
                  ? ` ⚠️ ${smsInfo.segments} Segments!`
                  : smsInfo.encoding === "UCS-2"
                  ? " ⚠️ Unicode (not GSM-7)"
                  : " ✓ 1 Segment OK"}
              </span>
            </div>
          )}

          {isWebPush && (
            <div className="text-[10px] font-semibold bg-purple-950/40 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded flex items-center gap-1">
              <span>🔔 Rich Emoji Web Push</span>
            </div>
          )}
        </div>

        {/* Post Title & Hook (Web Push) / Single Content Block (SMS) */}
        <div className="mt-2 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            {/* SMS has no separate title — the content box below is the whole message. */}
            {!isSms && <h4 className="text-xs font-bold text-white">{post.title}</h4>}
            {canWrite && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-1 text-slate-400 hover:text-white rounded ml-auto"
                title="Edit post text"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2 pt-1">
              {!isSms && (
                <div>
                  <label className="text-[10px] text-slate-400">Hook</label>
                  <input
                    type="text"
                    value={editHook}
                    onChange={(e) => setEditHook(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}
              <div>
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <label>{isSms ? "SMS Content" : "Caption"}</label>
                  {isSms && (() => {
                    const editSmsInfo = analyzeSmsSegments(editCaption);
                    return (
                      <span className={editSmsInfo.isMultiSegment ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                        {editSmsInfo.effectiveLength}/{editSmsInfo.singleSegmentLimit} {editSmsInfo.encoding} chars
                      </span>
                    );
                  })()}
                </div>
                <textarea
                  rows={3}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdits}
                  className="px-2 py-0.5 text-[10px] bg-amber-500 text-slate-950 font-bold rounded"
                >
                  Save
                </button>
              </div>
            </div>
          ) : isSms ? (
            <>
              {/* Single Content Box — the entire SMS message, nothing split out */}
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 relative group/hook">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap">{post.caption}</p>
                  <button
                    onClick={handleCopyCaption}
                    className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer shrink-0"
                    title="Copy Content"
                  >
                    {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* A/B Message Variant Picker */}
              {canWrite && post.hookVariants && post.hookVariants.length > 1 && (
                <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-lg p-2 space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">
                    {post.hookVariants.length} A/B Message Variants — click to use
                  </span>
                  <div className="space-y-1">
                    {post.hookVariants.map((variant, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={variant === post.caption}
                        onClick={() => onUpdatePost({ ...post, hook: variant, caption: variant })}
                        className={`w-full text-left text-[11px] px-2 py-1 rounded border transition-colors ${
                          variant === post.caption
                            ? "bg-indigo-900/60 border-indigo-600 text-indigo-200 font-bold cursor-default"
                            : "bg-slate-950 border-indigo-900/60 text-slate-400 hover:border-indigo-600 hover:text-indigo-200 cursor-pointer"
                        }`}
                      >
                        {variant === post.caption && "✓ "}{variant}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Hook Box */}
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 relative group/hook">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-white italic">"{post.hook}"</p>
                  <button
                    onClick={handleCopyHook}
                    className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                    title="Copy Hook"
                  >
                    {copiedHook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* A/B Hook Variant Picker */}
              {canWrite && post.hookVariants && post.hookVariants.length > 1 && (
                <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-lg p-2 space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">
                    {post.hookVariants.length} A/B Hook Variants — click to use
                  </span>
                  <div className="space-y-1">
                    {post.hookVariants.map((variant, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={variant === post.hook}
                        onClick={() => onUpdatePost({ ...post, hook: variant })}
                        className={`w-full text-left text-[11px] italic px-2 py-1 rounded border transition-colors ${
                          variant === post.hook
                            ? "bg-indigo-900/60 border-indigo-600 text-indigo-200 font-bold cursor-default"
                            : "bg-slate-950 border-indigo-900/60 text-slate-400 hover:border-indigo-600 hover:text-indigo-200 cursor-pointer"
                        }`}
                      >
                        {variant === post.hook && "✓ "}"{variant}"
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Main Caption */}
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap pt-1">
                {post.caption}
              </p>
            </>
          )}
        </div>

        {/* Promo Code & CTA Pill */}
        <div className="mt-3 pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60">
              {post.promoCodeUsed || "PAYDAY30OFF"}
            </span>
          </div>

          {!isSms && (
            <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60">
              CTA: {post.cta}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Toolbar & AI Refinement Instructions */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowAiMenu(!showAiMenu)}
                disabled={isRefining}
                className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-semibold transition-all border cursor-pointer ${
                  showAiMenu
                    ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs"
                    : "text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700"
                } disabled:opacity-50`}
              >
                {isRefining ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                )}
                <span>{showAiMenu ? "Hide Gemini Refine" : "Send Instructions to Gemini"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-semibold transition-all border cursor-pointer ${
                showComments
                  ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs"
                  : "text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Comments{comments.length > 0 ? ` (${comments.length})` : ""}</span>
            </button>
          </div>

          <button
            onClick={handleCopyCaption}
            className="text-xs font-semibold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            {copiedCaption ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Message</span>
              </>
            )}
          </button>
        </div>

        {/* AI Instruction Refinement Panel */}
        {showAiMenu && canWrite && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-xs animate-fadeIn text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-white text-[11px] flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                Refine SMS / Web Push with Gemini
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Real-time AI Rewrite</span>
            </div>

            {refineError && (
              <div className="p-2 bg-rose-950/50 border border-rose-800/60 rounded-lg text-[11px] text-rose-300 font-medium">
                {refineError}
              </div>
            )}

            {/* Quick Instruction Presets */}
            <div className="grid grid-cols-1 gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => handleAiRefine("Make SMS concise under 140 characters, add urgent link CTA and promo code")}
                className="text-left px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>📱</span>
                <span>Make SMS shorter (&lt;140 chars) + direct link CTA</span>
              </button>

              <button
                type="button"
                onClick={() => handleAiRefine("Increase Web Push urgency with countdown sentiment and high-click headline")}
                className="text-left px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>🔔</span>
                <span>Web Push: Increase Urgency &amp; High-Click Headline</span>
              </button>

              <button
                type="button"
                onClick={() => handleAiRefine("Highlight the promo code discount details prominently in the opening sentence")}
                className="text-left px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>🏷️</span>
                <span>Highlight Promo Code &amp; Discount Value First</span>
              </button>
            </div>

            {/* Custom Instruction Box */}
            <div className="pt-1 space-y-1.5">
              <label className="block text-[10px] text-slate-400 font-medium">
                Type your custom instructions to Gemini:
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Make it sound super friendly, add link paylaju.my/deal..."
                  value={customAiPrompt}
                  onChange={(e) => setCustomAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customAiPrompt.trim()) {
                      handleAiRefine(customAiPrompt);
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={!customAiPrompt.trim() || isRefining}
                  onClick={() => customAiPrompt.trim() && handleAiRefine(customAiPrompt)}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40 shrink-0 cursor-pointer"
                >
                  {isRefining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Refine Diff Review — nothing is applied until the user confirms */}
        {pendingRefine && (
          <div className="bg-indigo-950/30 border border-indigo-800/60 rounded-xl p-3 space-y-2.5 shadow-xs animate-fadeIn text-xs">
            <div className="flex items-center justify-between border-b border-indigo-800/60 pb-1.5">
              <span className="font-bold text-indigo-200 text-[11px] flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                Review AI Changes Before Applying
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Before</span>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 space-y-1">
                  <p className="text-[11px] font-bold text-slate-500 italic">"{post.hook}"</p>
                  <p className="text-[11px] text-slate-500 whitespace-pre-wrap">{post.caption}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">After</span>
                <div className="bg-slate-950 border border-indigo-700/70 rounded-lg p-2 space-y-1">
                  <p className={`text-[11px] font-bold italic ${pendingRefine.hook !== post.hook ? "text-indigo-200 bg-indigo-900/50 rounded px-0.5" : "text-white"}`}>
                    "{pendingRefine.hook}"
                  </p>
                  <p className={`text-[11px] whitespace-pre-wrap ${pendingRefine.caption !== post.caption ? "text-indigo-200 bg-indigo-900/50 rounded px-0.5" : "text-slate-300"}`}>
                    {pendingRefine.caption}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleDiscardRefine}
                className="px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleApplyRefine}
                className="px-3 py-1.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Changes</span>
              </button>
            </div>
          </div>
        )}

        {/* Comments Panel */}
        {showComments && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-xs animate-fadeIn text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-white text-[11px] flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5 text-slate-300" />
                Internal Review Comments
              </span>
            </div>

            {commentsQuery.isLoading ? (
              <p className="text-[11px] text-slate-500">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-[11px] text-slate-500">No comments yet.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {comments.map((c) => (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[11px]">{c.username}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Leave a note for the team..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newComment.trim()) handleAddComment();
                }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                disabled={!newComment.trim() || addCommentMutation.isPending}
                onClick={handleAddComment}
                className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-40 shrink-0 cursor-pointer"
              >
                {addCommentMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Post"}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete this post?"
        message={`This ${post.platform} message for ${post.brandName} will be permanently removed.`}
        confirmLabel="Delete Post"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          onDeletePost?.(post.id);
          setConfirmDelete(false);
        }}
      />
    </div>
  );
};
