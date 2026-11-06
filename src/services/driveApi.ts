import { GoogleAuth } from './googleAuth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const ROOT_FOLDER_NAME = 'Luminary Leitor';
export const BOOKS_FOLDER_NAME = 'livros';
export const LIBRARY_FILE_NAME = 'biblioteca.json';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveAuthError extends Error {
  constructor() {
    super('Sessão do Google expirada. Conecte novamente.');
    this.name = 'DriveAuthError';
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  ownedByMe?: boolean;
  owners?: { emailAddress?: string; displayName?: string }[];
  parents?: string[];
}

export interface ScannedCandidate {
  file: DriveFile;
  folderPath: string[];
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await GoogleAuth.getAccessToken();
  if (!token) throw new DriveAuthError();

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    GoogleAuth.invalidateToken();
    throw new DriveAuthError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Erro na API do Drive (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,ownedByMe,owners(emailAddress,displayName),parents';

export const DriveApi = {
  async getUser(): Promise<{ email: string; name: string }> {
    const res = await driveFetch(`${API}/about?fields=user(emailAddress,displayName)`);
    const data = await res.json();
    return { email: data.user?.emailAddress, name: data.user?.displayName };
  },

  async list(query: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await driveFetch(`${API}/files?${params}`);
      const data = await res.json();
      files.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  },

  /** Lists folders named "Luminary Leitor" (own folders + folders shared with me) */
  async findRootFolders(): Promise<DriveFile[]> {
    return this.list(`name = '${escapeQuery(ROOT_FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  },

  async findChild(parentId: string, name: string, mimeType?: string): Promise<DriveFile | null> {
    let q = `'${parentId}' in parents and name = '${escapeQuery(name)}' and trashed = false`;
    if (mimeType) q += ` and mimeType = '${mimeType}'`;
    const files = await this.list(q);
    return files[0] || null;
  },

  async listChildren(parentId: string): Promise<DriveFile[]> {
    return this.list(`'${parentId}' in parents and trashed = false`);
  },

  /**
   * Varre recursivamente todas as subpastas a partir dos nós raiz fornecidos.
   * Processa em lotes de pastas (BFS) e associa a cada arquivo o caminho de pastas em que ele está contido.
   */
  async listDescendants(
    roots: { id: string; name?: string; path?: string[] }[]
  ): Promise<ScannedCandidate[]> {
    const queue: { id: string; name: string; path: string[] }[] = [];
    const visited = new Set<string>();

    for (const r of roots) {
      if (!r.id || visited.has(r.id)) continue;
      visited.add(r.id);
      queue.push({
        id: r.id,
        name: r.name || '',
        path: r.path || (r.name ? [r.name] : [])
      });
    }

    const candidates: ScannedCandidate[] = [];

    while (queue.length > 0) {
      const batch = queue.splice(0, 15);
      const batchMap = new Map<string, { id: string; name: string; path: string[] }>();
      for (const item of batch) {
        batchMap.set(item.id, item);
      }

      const parentClauses = batch.map((item) => `'${item.id}' in parents`).join(' or ');
      const query = `(${parentClauses}) and trashed = false`;

      const children = await this.list(query);

      for (const child of children) {
        const parentId = child.parents?.find((pid) => batchMap.has(pid)) || batch[0].id;
        const parentItem = batchMap.get(parentId) || batch[0];
        const childPath = parentItem.path.concat(child.name);

        if (child.mimeType === FOLDER_MIME) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            queue.push({
              id: child.id,
              name: child.name,
              path: childPath
            });
          }
        } else {
          candidates.push({
            file: child,
            folderPath: parentItem.path
          });
        }
      }
    }

    return candidates;
  },

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const res = await driveFetch(`${API}/files?fields=${FILE_FIELDS}&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {})
      })
    });
    return res.json();
  },

  async ensureChildFolder(parentId: string, name: string): Promise<DriveFile> {
    const existing = await this.findChild(parentId, name, FOLDER_MIME);
    return existing || this.createFolder(name, parentId);
  },

  /** Uploads a new file (multipart upload) */
  async uploadFile(name: string, mimeType: string, data: ArrayBuffer | Blob | string, parentId: string): Promise<DriveFile> {
    const metadata = { name, mimeType, parents: [parentId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', data instanceof Blob ? data : new Blob([data], { type: mimeType }));

    const res = await driveFetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}&supportsAllDrives=true`,
      { method: 'POST', body: form }
    );
    return res.json();
  },

  /** Replaces the content of an existing file */
  async updateFileContent(fileId: string, mimeType: string, data: ArrayBuffer | Blob | string): Promise<void> {
    await driveFetch(`${UPLOAD_API}/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: data instanceof Blob ? data : new Blob([data], { type: mimeType })
    });
  },

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const res = await driveFetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`);
    return res.arrayBuffer();
  },

  async downloadText(fileId: string): Promise<string> {
    const res = await driveFetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`);
    return res.text();
  },

  async trashFile(fileId: string): Promise<void> {
    await driveFetch(`${API}/files/${fileId}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
  },

  async listPermissions(fileId: string): Promise<{ id: string; emailAddress?: string; role: string; type: string }[]> {
    const res = await driveFetch(
      `${API}/files/${fileId}/permissions?fields=permissions(id,emailAddress,role,type)&supportsAllDrives=true`
    );
    const data = await res.json();
    return data.permissions || [];
  },

  /** Shares a file/folder with an email as editor */
  async shareWithEmail(fileId: string, email: string): Promise<void> {
    await driveFetch(`${API}/files/${fileId}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email })
    });
  }
};
