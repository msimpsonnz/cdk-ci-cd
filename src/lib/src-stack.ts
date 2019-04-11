import cdk = require('@aws-cdk/cdk');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import lambda = require('@aws-cdk/aws-lambda');
import secretsmanager = require('@aws-cdk/aws-secretsmanager');
import ssm = require('@aws-cdk/aws-ssm');

export class SrcStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new codepipeline.Pipeline(this, 'mjsdemo-cdk-pipeline', {
      pipelineName: 'mjsdemo-cdk-pipeline',
    });

    const secretArnParam = new ssm.ParameterStoreString(this, 'secretMgrArn', {
      parameterName: 'secretMgrArn',
      version: 1,
    });
  
  const secretArnValue = secretArnParam.stringValue;

    const secret = secretsmanager.Secret.import(this, 'GitHubAccessToken', {
      secretArn: secretArnValue
    });

    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: 'msimpsonnz',
      repo: 'cdk-sample',
      oauthToken: secret.secretJsonValue('GitHubPAT'),
      outputArtifactName: 'SourceOutput',
      branch: 'master'
    });

    pipeline.addStage({
      name: 'Source',
      actions: [sourceAction],
    });

    const project = new codebuild.PipelineProject(this, 'MyProject');

    const buildAction = new codepipeline_actions.CodeBuildBuildAction({
      actionName: 'CodeBuild',
      project,
      inputArtifact: sourceAction.outputArtifact,
    });

    pipeline.addStage({
      name: 'Build',
      actions: [buildAction],
    });

    //buildAction.


    const hello = new lambda.Function(this, 'HelloHandler', {
      runtime: lambda.Runtime.NodeJS810,
      code: lambda.Code.asset('resources'),
      handler: 'hello.handler'               
    });
  }
}
