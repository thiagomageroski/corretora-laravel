import { describe, expect, it } from 'vitest';
import { cleanEmailInput, emailSuggestion, hasAccents } from './email';

describe('email helpers', () => {
    it('drops spaces typed or pasted into the address', () => {
        expect(cleanEmailInput(' ana.souza @gmail.com ')).toBe('ana.souza@gmail.com');
    });

    it('suggests the address without the accent the phone autocorrect added', () => {
        expect(emailSuggestion('linguiçajr8@gmail.com')).toBe('linguicajr8@gmail.com');
        expect(emailSuggestion('João.Silva@Gmail.com')).toBe('joao.silva@gmail.com');
    });

    it('leaves valid addresses alone', () => {
        expect(hasAccents('ok.user+1@gmail.com')).toBe(false);
        expect(emailSuggestion('ok.user+1@gmail.com')).toBeNull();
    });

    it('offers nothing when the characters cannot be turned into plain letters', () => {
        expect(emailSuggestion('用户@example.com')).toBeNull();
    });
});
