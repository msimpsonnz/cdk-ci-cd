import cdk = require('@aws-cdk/cdk');
import dynamodb = require('@aws-cdk/aws-dynamodb')
import lambda = require('@aws-cdk/aws-lambda');
import lambdaEvents = require('@aws-cdk/aws-lambda-event-sources');
import apigw = require('@aws-cdk/aws-apigateway');
import sqs = require('@aws-cdk/aws-sqs');
import { MakePipeline} from './lib/pipeline';

const app = new cdk.App();

const sharedStack = new cdk.Stack(app, 'SharedStack');

const sqsQueue = new sqs.Queue(sharedStack, 'SQS', {
  visibilityTimeoutSec: 300
});

const dataTable = new dynamodb.Table(sharedStack, 'DataTable', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.String },
  billingMode: dynamodb.BillingMode.PayPerRequest
});

const lambdaStarterStack = new cdk.Stack(app, 'LambdaStarterStack', {
  autoDeploy: false,
});
lambdaStarterStack.addDependency(sharedStack);
const lambdaStarterCode = lambda.Code.cfnParameters();
const starterFunc = new lambda.Function(lambdaStarterStack, 'Lambda', {
  code: lambdaStarterCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    SQS_QUEUE_NAME: sqsQueue.queueUrl
  }
});

sqsQueue.grantSendMessages(starterFunc);

new apigw.LambdaRestApi(lambdaStarterStack, 'StarterEndpoint', {
  handler: starterFunc
});

const pipelineStarterStack = new cdk.Stack(app, 'PipelineStarterStack');
pipelineStarterStack.addDependency(lambdaStarterStack);
MakePipeline(pipelineStarterStack, 'PipelineStarterStack', 'cdk-ci-cd', 'LambdaStarterStack', 'starter', lambdaStarterCode);

const lambdaWorkerStack = new cdk.Stack(app, 'LambdaWorkerStack', {
  autoDeploy: false,
});
lambdaWorkerStack.addDependency(sharedStack);
const lambdaWorkerCode = lambda.Code.cfnParameters();
const workerFunc = new lambda.Function(lambdaWorkerStack, 'Lambda', {
  code: lambdaWorkerCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    DYNAMO_TABLE: dataTable.tableName
  }
});
const workerEventSource = new lambdaEvents.SqsEventSource(sqsQueue);
workerFunc.addEventSource(workerEventSource);
dataTable.grantReadWriteData(workerFunc);

const pipelineWorkerStack = new cdk.Stack(app, 'PipelineWorkerStack');
pipelineWorkerStack.addDependency(lambdaWorkerStack);
MakePipeline(pipelineWorkerStack, 'PipelineWorkerStack', 'cdk-ci-cd', 'LambdaWorkerStack', 'worker', lambdaWorkerCode);