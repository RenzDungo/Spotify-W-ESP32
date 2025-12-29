export default interface ESP32CurrentTrackRequest {
  /** Unique device identifier stored in `devices.uuid` */
  uuid: string;
  spotify_auth_id: number;
}