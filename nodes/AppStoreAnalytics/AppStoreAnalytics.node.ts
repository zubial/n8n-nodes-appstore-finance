import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType, NodeOperationError,
} from 'n8n-workflow';
import axios from 'axios';
import * as zlib from 'zlib';
import * as util from 'util';
import {URLSearchParams} from "node:url";

const gunzip = util.promisify(zlib.gunzip);

export class AppStoreAnalytics implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AppStore Analytics',
		name: 'appStoreAnalytics',
		icon: 'file:AppStoreAnalyticsLogo.svg',
		group: ['output'],
		version: 1,
		triggerPanel: false,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Download Apple App Store analytics reports',
		defaults: {
			name: 'AppStore Analytics',
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
				displayName: 'Granularity',
				name: 'granularity',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Daily',
						value: 'DAILY',
					},
					{
						name: 'Monthly',
						value: 'MONTHLY',
					},
				],
				default: 'MONTHLY',
			},
			{
				displayName: 'Access Type',
				name: 'access_type',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'One Time Snapshot',
						value: 'ONE_TIME_SNAPSHOT',
					},
					{
						name: 'Ongoing',
						value: 'ONGOING',
					},
				],
				default: 'ONGOING',
			},
			{
				displayName: 'App ID',
				name: 'appId',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Report Name',
				name: 'reportName',
				type: 'string',
				default: 'App Store Installation and Deletion Standard',
				required: true,
			},
			{
				displayName: 'Report Date',
				name: 'reportDate',
				type: 'string',
				default: '2025-01-01',
			},
			{
				displayName: 'Report Category',
				name: 'category',
				type: 'string',
				default: 'APP_USAGE',
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
			const appId = this.getNodeParameter('appId', itemIndex) as string;
			const granularity = this.getNodeParameter('granularity', itemIndex) as string;
			const access_type = this.getNodeParameter('access_type', itemIndex) as string;
			const category = this.getNodeParameter('category', itemIndex) as string;
			const reportName = this.getNodeParameter('reportName', itemIndex) as string;
			const reportDate = this.getNodeParameter('reportDate', itemIndex) as string;
			const options = this.getNodeParameter('options', itemIndex);
			const resultField = options.result_field ? (options.result_field as string) : 'report';

			// Credentials
			const credentials = await this.getCredentials('appStoreAPI');

			const jwtToken = generateJWT(credentials);

			console.log(jwtToken);

			const accessUrl = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/analyticsReportRequests`;
			const getAccess = await axios.get(accessUrl, {
				headers: {
					Authorization: `Bearer ${jwtToken}`
				}
			});

			const access = getAccess.data.data || [];

			if (access.length > 0) {
				const analyticsReport = access.filter(
					(report: any) => (report.attributes.accessType === access_type && report.type === "analyticsReportRequests"),
				);

				const reportParams = new URLSearchParams({
					'filter[category]': category,
					'filter[name]': reportName,
				}).toString();

				const reportUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/${analyticsReport[0].id}/reports?${reportParams}`;
				//console.log(reportUrl);

				const getReport = await axios.get(reportUrl, {
					headers: {
						Authorization: `Bearer ${jwtToken}`
					}
				});

				const report = getReport.data.data || [];

				if (report.length > 0) {

					const instanceParams  = new URLSearchParams({
                            'filter[granularity]': granularity,
                            'filter[processingDate]': reportDate,
                        }).toString();

					const instanceUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReports/${report[0].id}/instances?${instanceParams}`;
					//console.log(instanceUrl);

					const getInstance = await axios.get(instanceUrl, {
						headers: {
							Authorization: `Bearer ${jwtToken}`
						}
					});

					const instance = getInstance.data.data || [];

					if (instance.length > 0) {

						const segmentUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReportInstances/${instance[0].id}/segments`;
						//console.log(segmentUrl);

						const getSegment = await axios.get(segmentUrl, {
							headers: {
								Authorization: `Bearer ${jwtToken}`
							}
						});

						const segment = getSegment.data.data || [];

						if (segment.length > 0) {

							const downloadUrl = segment[0].attributes.url;
							//console.log(downloadUrl);

							const getDownload = await axios.get(downloadUrl, {
								responseType: 'arraybuffer',
							});

							const decompressed = await gunzip(getDownload.data);

							if (operation === 'download_report') {
								returnItems.push({
									json: {},
									binary: {
										report: await this.helpers.prepareBinaryData(
											Buffer.from(decompressed),
											`report_${category.toLowerCase()}_${reportName.replace(' ', '-').toLowerCase()}_${reportDate}.csv`,
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

						} else {
							throw new NodeOperationError(this.getNode(), `Segment not found`);
						}
					} else {
						throw new NodeOperationError(this.getNode(), `Instance not found`);
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Report Name ${reportName} for ${reportDate} not found`);
				}
			} else {
				throw new NodeOperationError(this.getNode(), "No report found for this AppId");
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


