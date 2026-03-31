export interface DashboardConnectorCapabilities {
  canReadGarden: true;
  canReadRuntimeState: true;
  canSubmitInteractions: true;
  canSubscribeToEvents: true;
}

export interface DashboardConnector {
  kind: 'future-dashboard-connector';
  status: 'placeholder';
  capabilities: DashboardConnectorCapabilities;
  notes: string[];
}

export function createDashboardConnector(): DashboardConnector {
  return {
    kind: 'future-dashboard-connector',
    status: 'placeholder',
    capabilities: {
      canReadGarden: true,
      canReadRuntimeState: true,
      canSubmitInteractions: true,
      canSubscribeToEvents: true,
    },
    notes: [
      'The legacy dashboard implementation has been removed.',
      'A future dashboard should be a client over shared runtime behavior.',
      'It should read garden data, runtime interaction state, submit interactions, and subscribe to events.',
    ],
  };
}
