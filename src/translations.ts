import { readJson, writeJson } from 'fs-extra';
import { resolvePattern } from './files';

export class TranslationFile {
  constructor(public readonly path: string, public data: any) {}

  private _keys: string[] = null;
  public get keys() {
    if (this._keys === null) {
      this._keys = getTranslationKeys(this.data);
    }
    return this._keys;
  }
}

export class ComparedTranslationFile extends TranslationFile {
  reference: TranslationFile;
  additions: string[] = [];
  substractions: string[] = [];
}

export async function saveTranslation(file: TranslationFile): Promise<void> {
  await writeJson(file.path, sortTranslation(file.data), { spaces: 2 });
}

export async function saveTranslations(files: TranslationFile[]): Promise<void> {
  await Promise.all(files.map(t => saveTranslation(t)));
}

export async function loadTranslation(path: string): Promise<TranslationFile> {
  const data = await readJson(path);
  return new TranslationFile(path, data);
}

export async function loadTranslations(pattern: string): Promise<TranslationFile[]> {
  const paths = await resolvePattern(pattern);
  return Promise.all(paths.map(path => loadTranslation(path)));
}

export function serializeComparedTranslation(files: ComparedTranslationFile[]): string {
  if (files.length === 0) {
    return '';
  }

  let output = `### ${files[0].reference.path}\n`;

  for (const file of files) {
    output += `@@@ ${file.path}\n`;
    for (const key of file.additions) {
      output += `+++ ${key}\n`;
    }
    for (const key of file.substractions) {
      output += `--- ${key}\n`;
    }
  }

  return output;
}

export async function deserializeComparedTranslations(input: string): Promise<ComparedTranslationFile[]> {
  const compared: ComparedTranslationFile[] = [];
  let reference: TranslationFile = null;
  let current: ComparedTranslationFile = null;

  for (const line of input.split('\n')) {
    const prefix = line.substr(0, 3);
    const value = line.substr(4);

    switch (prefix) {
      case '###':
        reference = await loadTranslation(value);
        break;
      case '@@@':
        const data = await readJson(value);
        current = new ComparedTranslationFile(value, data);
        current.reference = reference;
        compared.push(current);
        break;
      case '+++':
        current.additions.push(value);
        break;
      case '---':
        current.substractions.push(value);
        break;
    }
  }

  return compared;
}

export function compareTranslation(reference: TranslationFile, file: TranslationFile): ComparedTranslationFile {
  const compared = new ComparedTranslationFile(file.path, file.data);
  compared.reference = reference;
  compared.additions = file.keys.filter(key => !reference.keys.includes(key));
  compared.substractions = reference.keys.filter(key => !file.keys.includes(key));
  return compared;
}

export function addTranslationKey(data: any, key: string, value: string) {
  if (!data) {
    return false;
  }

  if (!key.includes('.')) {
    if (!data[key]) {
      data[key] = value;
      return true;
    }
    return false;
  }

  const [firstkey, ...otherKeys] = key.split('.');

  if (!data[firstkey]) {
    data[firstkey] = {};
  }

  return addTranslationKey(data[firstkey], otherKeys.join('.'), value);
}

export function deleteTranslationKey(data: any, key: string): boolean {
  if (!data) {
    return false;
  }

  if (!key.includes('.')) {
    if (data[key]) {
      delete data[key];
      return true;
    }
    return false;
  }

  const [firstkey, ...otherKeys] = key.split('.');
  return deleteTranslationKey(data[firstkey], otherKeys.join('.'));
}

export function getTranslationValue(data: any, path: string) {
  return path.split('.').reduce((data, key) => (data && data[key]) || null, data);
}

function sortTranslation(data: any): any {
  return Object.keys(data)
    .sort()
    .reduce((sorted, key) => {
      if (typeof data[key] === 'string') {
        sorted[key] = data[key];
      } else {
        sorted[key] = sortTranslation(data[key]);
      }
      return sorted;
    }, {});
}

function getTranslationKeys(data: any, prefix: string = '') {
  return Object.keys(data).reduce((keys, key) => {
    if (typeof data[key] === 'string') {
      keys.push(prefix + key);
    } else {
      keys = [...keys, ...getTranslationKeys(data[key], prefix + key + '.')];
    }
    return keys;
  }, []);
}
