// scripts/configure-ses-permissions.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error('Command stderr:', stderr);
    }
    return stdout.trim();
  } catch (error) {
    console.error('Error executing command:', error);
    throw error;
  }
}

async function configureSESPermissions() {
  try {
    console.log('Starting SES permissions configuration');

    //const region = process.env.AWS_REGION || 'us-east-1';
    const roleName = process.argv[2];

    if (!roleName) {
      console.error('Please provide a role name as an argument');
      console.error('Usage: ts-node scripts/configure-ses-permissions.ts <role-name>');
      return;
    }

    console.log('Using role:', roleName);

    // Verificar si el rol existe
    console.log('Checking if role exists...');
    try {
      const roleOutput = await runCommand(`aws iam get-role --role-name ${roleName} --query Role.Arn --output text`);
      console.log('Role exists with ARN:', roleOutput);
    } catch (roleError) {
      console.error('Error getting role. Please make sure the role exists and you have AWS CLI configured correctly.');
      return;
    }

    // Crear archivo de política temporal
    console.log('Creating SES policy...');
    const sesPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'ses:SendEmail',
            'ses:SendRawEmail',
            'ses:SendTemplatedEmail',
            'ses:GetIdentityVerificationAttributes',
            'ses:ListIdentities',
            'ses:VerifyEmailIdentity'
          ],
          Resource: '*'
        }
      ]
    };

    const policyFilePath = path.join(__dirname, 'ses-policy.json');
    fs.writeFileSync(policyFilePath, JSON.stringify(sesPolicy, null, 2));
    console.log('Policy file created at:', policyFilePath);

    // Agregar política al rol
    console.log('Adding SES policy to role...');
    try {
      await runCommand(`aws iam put-role-policy --role-name ${roleName} --policy-name SESSendEmailPolicy --policy-document file://${policyFilePath}`);
      console.log('SES policy added to role successfully');
    } catch (policyError) {
      console.error('Error adding policy to role:', policyError);
      return;
    }

    // Eliminar archivo de política temporal
    fs.unlinkSync(policyFilePath);
    console.log('Temporary policy file removed');

    console.log('SES permissions configuration completed');

  } catch (error) {
    console.error('Error configuring SES permissions:', error);
  }
}

// Ejecutar configuración
configureSESPermissions().catch(console.error);
