import { AppSyncAuthorizationType, EventApi } from 'aws-cdk-lib/aws-appsync';
import { Construct } from 'constructs';

/** AppSync Events: clients subscribe with API key; only the backend publishes (IAM). */
export class Realtime extends Construct {
  readonly api: EventApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const { API_KEY, IAM } = AppSyncAuthorizationType;

    this.api = new EventApi(this, 'EventApi', {
      apiName: 'sharping-code-events',
      authorizationConfig: {
        authProviders: [{ authorizationType: API_KEY }, { authorizationType: IAM }],
        connectionAuthModeTypes: [API_KEY],
        defaultPublishAuthModeTypes: [IAM],
        defaultSubscribeAuthModeTypes: [API_KEY],
      },
    });

    // Channels `/game/{code}`.
    this.api.addChannelNamespace('game', {
      authorizationConfig: { publishAuthModeTypes: [IAM], subscribeAuthModeTypes: [API_KEY] },
    });
  }

  get apiKey(): string {
    return this.api.apiKeys['Default']!.attrApiKey;
  }
}
