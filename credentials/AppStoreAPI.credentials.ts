import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AppStoreAPI implements ICredentialType {
	name = 'appStoreAPI';

	displayName = 'AppStore API';

	properties: INodeProperties[] = [
		{
			displayName: 'Issuer Id',
			name: 'issuerId',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Key Id',
			name: 'keyId',
			type: 'string',
			required: true,
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: '-----BEGIN PRIVATE KEY-----\\nMIGTAgEAMB...\\n-----END PRIVATE KEY-----',
			description: 'Private key in PEM format, either encoded with \\n line breaks, or as base64.',
			required: true,
		},
	];
}
