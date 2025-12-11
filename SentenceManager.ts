import { Editor, EditorPosition } from "obsidian";

export interface SentenceData {
	text: string;
	start: number; // Absolute offset in file
	end: number; // Absolute offset in file
	versions: string[];
	fullTextWithVersions: string; // The text + the comment block
}

export class SentenceManager {
	// Regex to find sentence boundaries.
	// Matches: (Any character that is not a sentence terminator) + (Sentence terminator)
	// Terminators: . ? !
	// Note: This is a naive implementation. It might fail on abbreviations (Mr., Dr., etc.)
	private static SENTENCE_REGEX = /[^.!?\n]+[.!?]+/g;
	private static VERSIONS_REGEX = /%% versions: (.*?) %%/;

	/**
	 * Finds the sentence at the current cursor position.
	 */
	public static getSentenceAtCursor(editor: Editor): SentenceData | null {
		const cursor = editor.getCursor();
		const doc = editor.getValue();
		const cursorOffset = editor.posToOffset(cursor);

		// We need to find the sentence boundaries around the cursor.
		// 1. Find the start of the sentence (previous terminator or start of file/line)
		// 2. Find the end of the sentence (next terminator)

		// Let's scan backwards from cursor to find start
		let start = 0;
		for (let i = cursorOffset - 1; i >= 0; i--) {
			const char = doc[i];
			if ([".", "!", "?", "\n"].includes(char)) {
				// Check if it's a terminator of the PREVIOUS sentence.
				// If we hit a newline, that's definitely a hard boundary for now.
				start = i + 1;
				break;
			}
		}

		// Scan forwards to find end
		let end = doc.length;
		for (let i = cursorOffset; i < doc.length; i++) {
			const char = doc[i];
			if ([".", "!", "?", "\n"].includes(char)) {
				end = i + 1;
				break;
			}
		}

		// Extract the raw sentence candidate
		let rawText = doc.substring(start, end);

		// Trim leading whitespace from start, but adjust start offset
		const leadingSpaceMatch = rawText.match(/^\s+/);
		if (leadingSpaceMatch) {
			start += leadingSpaceMatch[0].length;
			rawText = rawText.substring(leadingSpaceMatch[0].length);
		}

		// Check for versions comment immediately following the sentence
		// We look ahead from 'end'
		let versions: string[] = [];
		let fullEnd = end;

		const remainingDoc = doc.substring(end);
		// Allow some whitespace between sentence and comment
		const commentMatch = remainingDoc.match(/^\s*%% versions: (.*?) %%/);

		if (commentMatch) {
			try {
				// The versions are stored as a JSON array string inside the comment
				versions = JSON.parse(commentMatch[1]);
				fullEnd = end + commentMatch[0].length;
			} catch (e) {
				console.error("Failed to parse versions", e);
			}
		}

		return {
			text: rawText,
			start: start,
			end: end, // End of the sentence text
			versions: versions,
			fullTextWithVersions: doc.substring(start, fullEnd),
		};
	}

	/**
	 * Updates the sentence in the document, managing versions.
	 */
	public static updateSentence(
		editor: Editor,
		data: SentenceData,
		newText: string
	): void {
		// If text hasn't changed, do nothing
		if (data.text === newText) return;

		// Add the OLD text to versions
		const updatedVersions = [...data.versions];
		// Only add if it's not already the last version (dedupe)
		if (
			updatedVersions.length === 0 ||
			updatedVersions[updatedVersions.length - 1] !== data.text
		) {
			updatedVersions.push(data.text);
		}

		const versionsString = JSON.stringify(updatedVersions);
		const versionComment = ` %% versions: ${versionsString} %%`;

		// We replace the entire range (sentence + old comment) with (new sentence + new comment)
		// We need to calculate the length of the old full text to replace correctly
		const lengthOfOldFullText = data.fullTextWithVersions.length;

		const replacement = newText + versionComment;

		editor.replaceRange(
			replacement,
			editor.offsetToPos(data.start),
			editor.offsetToPos(data.start + lengthOfOldFullText)
		);
	}

	/**
	 * Find previous sentence range
	 */
	public static getPreviousSentenceOffset(
		editor: Editor,
		currentStart: number
	): number | null {
		// Scan backwards from currentStart - 1
		const doc = editor.getValue();
		// Skip whitespace
		let i = currentStart - 1;
		while (i >= 0 && /\s/.test(doc[i])) i--;

		if (i < 0) return null;

		// Now we are at the end of the previous sentence (likely a terminator)
		// We need to find the start of this sentence.
		// We can reuse the logic: scan back until we hit another terminator or newline

		// But wait, getSentenceAtCursor logic relies on being INSIDE the sentence.
		// So if we find a point inside the previous sentence, we can call getSentenceAtCursor with that pos.

		// i is at the end terminator. i-1 should be inside.
		if (i > 0) return i - 1;
		return 0;
	}

	/**
	 * Find next sentence range
	 */
	public static getNextSentenceOffset(
		editor: Editor,
		currentEnd: number
	): number | null {
		const doc = editor.getValue();
		// Start scanning from currentEnd
		// Skip whitespace and comments
		let i = currentEnd;

		// We might need to skip the current sentence's version comment if we didn't include it in currentEnd
		// But getSentenceAtCursor returns 'end' as end of text.
		// The logic in getSentenceAtCursor handles the comment reading.
		// So we just need to find where the next sentence text starts.

		// Actually, safer way:
		// 1. Get current sentence data again to be sure we have the full extent including comments.
		// 2. Start searching from after the full extent.

		// But we don't have the full extent passed here easily unless we pass SentenceData.
		// Let's assume the caller passes the offset AFTER the current sentence (and its comments).

		while (i < doc.length && /\s/.test(doc[i])) i++;

		// Check if we are at a comment start that is NOT the version comment of the previous sentence
		// (Assuming the caller handled the previous sentence's comment)

		if (i >= doc.length) return null;

		// We are likely at the start of the next sentence.
		return i;
	}
}
