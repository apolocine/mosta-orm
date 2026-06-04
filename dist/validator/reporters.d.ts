import type { Report } from './types.js';
export interface FormatOptions {
    colors?: boolean;
    verbose?: boolean;
}
export declare function formatText(report: Report, opts?: FormatOptions): string;
export declare function formatJson(report: Report, pretty?: boolean): string;
export declare function formatMarkdown(report: Report): string;
