/**
 * The common-password list of DEC-028 and DEC-137. Do not edit: the script
 * `src/scripts/build-common-passwords.ts` makes this file.
 *
 * Source: the password list of the npm package `@zxcvbn-ts/language-common` 4.1.3
 * (`src/passwords.json`), license MIT.
 *
 * The license of the package (LICENSE.txt, MIT), in full:
 *
 * Copyright (c) 2012-2016 Dan Wheeler and Dropbox, Inc.
 * Copyright (c) 2021 @zxcvbn-ts
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Rule of the file (DEC-137): it holds each entry of 15 characters or more
 * of the source. DEC-028 refuses each shorter password, so a shorter entry has
 * no use. The entries are lower case, without duplicates, in sorted order.
 * Entries: 41.
 */
export const COMMON_PASSWORD_ENTRIES: readonly string[] = [
  "111222333444555",
  "122333444455555",
  "1234567887654321",
  "12345678900987654321",
  "1234567890987654321",
  "1234567890qwerty",
  "12345678987654321",
  "123456789987654321",
  "123456789qwerty",
  "1234qwerasdfzxcv",
  "1qa2ws3ed4rf5tg",
  "1qaz2wsx3edc4rfv",
  "1qazxsw23edcvfr4",
  "23176djivanfros",
  "420842084208555",
  "aksjdlasdakj89879",
  "bhrh0h2oof6xbqjeh",
  "bpgjldsgjldthnf",
  "hd764nw5d7e1vb1",
  "hd764nw5d7e1vbv",
  "lhbjkjubz2957704",
  "lytdybrbdfvgbhf",
  "mailcreated5240",
  "momsanaladventure",
  "ne_e_pod_chehyl",
  "nemvxyheqdd5oqxyxyzi",
  "nick1234-rem936",
  "passwordassword",
  "passwordpassword",
  "passwordstandard",
  "polniypizdec0211",
  "polniypizdec1102",
  "polniypizdec110211",
  "q1w2e3r4t5y6u7i8",
  "q1w2e3r4t5y6u7i8o9p0",
  "qazwsxedcrfvtgb",
  "qwertasdfgzxcvb",
  "qwerty123456789",
  "qwertyuiop12345",
  "zqjphsyf6ctifgu",
  "zxcvbnm123456789",
];
