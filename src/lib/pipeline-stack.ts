import cdk = require('@aws-cdk/cdk');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import lambda = require('@aws-cdk/aws-lambda');
import secretsmanager = require('@aws-cdk/aws-secretsmanager');
import ssm = require('@aws-cdk/aws-ssm');

export class LambdaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //const lambdaCode = lambda.Code.asset();
    new lambda.Function(this, 'Lambda', {
      runtime: lambda.Runtime.Go1x,
      code: lambda.Code.asset('resources'),
      handler: 'main'               
    });
  }
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const secretArnParam = new ssm.ParameterStoreString(this, 'secretMgrArn', {
      parameterName: 'secretMgrArn'
    }).stringValue;;

    const secret = secretsmanager.Secret.import(this, 'GitHubAccessToken', {
      secretArn: secretArnParam
    });

    const pipeline = new codepipeline.Pipeline(this, 'mjsdemo-cdk-pipeline', {
      pipelineName: 'mjsdemo-cdk-pipeline',
    });

    const cdkSourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'CDK_Source',
      owner: 'msimpsonnz',
      repo: 'cdk-ci-cd',
      oauthToken: secret.secretJsonValue('GitHubPAT'),
      outputArtifactName: 'SourceCdkOutput',
      branch: 'master'
    });

    const lambdaSourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'Lambda_Source',
      owner: 'msimpsonnz',
      repo: 'cdk-ci-cd',
      oauthToken: secret.secretJsonValue('GitHubPAT'),
      outputArtifactName: 'SourceLambdaOutput',
      branch: 'master'
    });

    pipeline.addStage({
      name: 'Source',
      actions: [cdkSourceAction, lambdaSourceAction],
    });

    const cdkBuildProject = new codebuild.Project(this, 'CdkBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
      },
      buildSpec: {
        version: '0.2',
        phases: {
          install: {
            commands: [
              'cd ./src',
              'npm install'
            ]
          },
          build: {
            commands: [
              'cd ./src',
              'npm run build',
              'npm run cdk synth LambdaStack -- -o .',
            ],
          },
        },
        artifacts: {
          files: 'LambdaStack.template.yaml',
        },
      },
    });

    const cdkBuildAction = new codepipeline_actions.CodeBuildBuildAction({
      actionName: 'CDK_Build',
      project: cdkBuildProject,
      inputArtifact: cdkSourceAction.outputArtifact,
    });

    const lambdaBuildProject = new codebuild.Project(this, 'LambdaBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_GOLANG_1_10,
      },
      buildSpec: {
        version: '0.2',
        phases: {
          install: {
            commands: [
              'ln -s "${CODEBUILD_SRC_DIR}/src/resources" "/go/src/handler"',
              'go get golang.org/x/lint/golint' ,
              'go get -u github.com/stretchr/testify'
            ]
          },
          pre_build: {
            commands: [
              'cd "/go/src/handler"',
              'go get ./...',
              'golint -set_exit_status',
              'go tool vet',
              'go tool vet .',
              'go test .' 
            ]
          },
          build: {
            commands: 'go build -o main',
          },
        },
        artifacts: {
          type: 'zip'
        },
      },
    });


    const lambdaBuildAction = new codepipeline_actions.CodeBuildBuildAction({
      actionName: 'Lambda_Build',
      project: lambdaBuildProject,
      inputArtifact: lambdaSourceAction.outputArtifact,
    });
    
    pipeline.addStage({
      name: 'Build',
      actions: [cdkBuildAction, lambdaBuildAction],
    });

    //const lambdaCode = lambda.Code.
    //const lambdaCode = lambda.Code.CfnParametersCode();
    // finally, deploy your Lambda Stack
    pipeline.addStage({
      name: 'Deploy',
      actions: [
        new codepipeline_actions.CloudFormationCreateUpdateStackAction({
          actionName: 'Lambda_CFN_Deploy',
          templatePath: cdkBuildAction.outputArtifact.atPath('LambdaStack.template.yaml'),
          stackName: 'LambdaStackDeployedName',
          adminPermissions: true,
          parameterOverrides: {
            //...lambdaCode.assign(lambdaBuildAction.outputArtifact.s3Coordinates),
          },
          additionalInputArtifacts: [
            lambdaBuildAction.outputArtifact,
          ],
        }),
      ],
    });

    

  }
}
