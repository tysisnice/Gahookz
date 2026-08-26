/*
 * Archived component inventory for the former free-text Herd mode.
 *
 * The original components lived in standalone/public/app.jsx and shared local
 * helpers from that file. They were:
 *
 * - HerdAnswerPanel: free-text and optional-image response form with draft save
 * - HerdPartyStatus: party-screen answer/ranking progress
 * - HerdRankingPanel: anonymous one-favourite selection
 * - HerdCombinedResults: winning response, author, voters, and personal score
 * - HerdRankedVoters: eligible/self-vote badges
 * - HerdResultsPanel: earlier exact-match results presentation
 *
 * This inventory is kept beside the executable ranking code and flow tests so
 * a later Herd redesign can recover the intent without leaving dead components
 * in the production bundle.
 */

export const LEGACY_HERD_COMPONENTS = Object.freeze([
  "HerdAnswerPanel",
  "HerdPartyStatus",
  "HerdRankingPanel",
  "HerdCombinedResults",
  "HerdRankedVoters",
  "HerdResultsPanel"
]);
