export const buildJanusRecorderCommand = (recordingDirectory: string, recordingBaseName: string): string[] => {
  return [
    'janus-pp-rec',
    `${recordingDirectory}/${recordingBaseName}.mjr`,
    `${recordingDirectory}/${recordingBaseName}.webm`,
  ];
};
