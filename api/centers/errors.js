export class CentersUnavailable extends Error {
  constructor() {
    super('centers are temporarily unavailable');
    this.code = 'centers-unavailable';
  }
}

export class CentersError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
