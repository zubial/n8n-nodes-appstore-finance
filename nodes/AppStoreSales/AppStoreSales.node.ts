import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from 'n8n-workflow';
import { URLSearchParams } from 'node:url';
import axios from 'axios';
import * as zlib from 'zlib';
import * as util from 'util';

const gunzip = util.promisify(zlib.gunzip);

export class AppStoreSales implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AppStore Sales',
		name: 'appStoreSales',
		icon: 'file:AppStoreSalesLogo.svg',
		group: ['output'],
		version: 1,
		triggerPanel: false,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Download Apple App Store sales reports',
		defaults: {
			name: 'AppStore Sales',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				displayName: 'AppStore API',
				name: 'appStoreAPI',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Download & Parse',
						value: 'parse_report',
						action: 'Download and parse report',
					},
					{
						name: 'Download',
						value: 'download_report',
						action: 'Download report',
					},
				],
				default: 'parse_report',
			},
			{
				displayName: 'Frequency',
				name: 'frequency',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Daily Sales Report',
						value: 'DAILY',
					},
					{
						name: 'Monthly Sales Report',
						value: 'MONTHLY',
					},
				],
				default: 'MONTHLY',
			},
			{
				displayName: 'Vendor Number',
				name: 'vendorNumber',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Report Date (YYYY-MM-DD)',
				name: 'reportDate',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Put Result in Field',
						name: 'result_field',
						type: 'string',
						default: 'report',
						description: 'The name of the output field to put the data in',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let item: INodeExecutionData;
		const returnItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			item = { ...items[itemIndex] };
			const newItem: INodeExecutionData = {
				json: item.json,
				pairedItem: {
					item: itemIndex,
				},
			};

			// Parameters & Options
			const operation = this.getNodeParameter('operation', itemIndex);
			const vendorNumber = this.getNodeParameter('vendorNumber', itemIndex) as string;
			const frequency = this.getNodeParameter('frequency', itemIndex) as string;
			const reportDate = this.getNodeParameter('reportDate', itemIndex) as string;
			const options = this.getNodeParameter('options', itemIndex);
			const resultField = options.result_field ? (options.result_field as string) : 'report';

			// Credentials
			const credentials = await this.getCredentials('appStoreAPI');

			const jwtToken = generateJWT(credentials);

			const params = new URLSearchParams({
				'filter[reportType]': "SALES",
				'filter[reportSubType]': "SUMMARY",
				'filter[frequency]' : frequency,
				'filter[reportDate]': reportDate,
				'filter[vendorNumber]': vendorNumber,
			}).toString();

			const url = `https://api.appstoreconnect.apple.com/v1/salesReports?${params}`;
			console.log('Sales Report Request URL:', url);

			let response;
			try {
				response = await axios.get(url, {
					headers: {
						Authorization: `Bearer ${jwtToken}`,
					},
					responseType: 'arraybuffer',
				});
			} catch (error: any) {
				console.error('Apple API error:', error.message);
				throw error;
			}

			const decompressed = await gunzip(response.data);

			if (operation === 'download_report') {
				returnItems.push({
					json: {},
					binary: {
						report: await this.helpers.prepareBinaryData(
							Buffer.from(decompressed),
							`report_${reportDate}.tsv`,
						),
					},
					pairedItem: { item: itemIndex },
				});
			} else {
				const content = decompressed.toString('utf8');
				const lines = content.trim().split('\n');

				let i = 0;
				const header = lines[i].split('\t');
				i++;
				const transactions = [];
				for (; i < lines.length; i++) {
					const row = lines[i].split('\t');
					const entry: { [key: string]: string } = {};
					header.forEach((key, idx) => {
						entry[key] = row[idx];
					});
					transactions.push(entry);
				}

				newItem.json[resultField] = transactions;

				returnItems.push(newItem);
			}
		}

		return [returnItems];
	}
}

function generateJWT(credentials: any): string {
	const jwt = require('jsonwebtoken');

	const privateKey = credentials.privateKey.includes('-----BEGIN')
		? credentials.privateKey.replace(/\\n/g, '\n')
		: Buffer.from(credentials.privateKey, 'base64').toString('utf-8');

	const payload = {
		iss: credentials.issuerId,
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 60 * 10,
		aud: 'appstoreconnect-v1',
	};

	const options = {
		algorithm: 'ES256',
		header: {
			alg: 'ES256',
			kid: credentials.keyId,
			typ: 'JWT',
		},
	};

	return jwt.sign(payload, privateKey, options);
}


