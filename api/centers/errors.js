export class CentersUnavailable extends Error {
  constructor() {
    super('centers are temporarily unavailable');
    this.code = 'centers-unavailable';
  }
}
